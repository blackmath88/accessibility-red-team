import { z } from "zod";
import { requestRun } from "../../src/control-center/commands.js";
import { ArtifactKindSchema, ExecutionPolicySchema, ExecutionProviderSchema, RunKindSchema, RunStageSchema, type Run } from "../../src/control-center/contracts.js";
import { authenticateGitHubRunner, authenticateNebuchadnezzar, authenticateOperator, HttpAuthError, type AuthenticatedActor, type OperatorPermission } from "./auth.js";
import { D1ControlCenterStore } from "./d1-store.js";
import { createLeaseToken, hashLeaseToken, leaseExpiry, leaseToken } from "./leases.js";
import { queueWithProvider } from "./providers.js";
import { storeArtifact } from "./r2-artifacts.js";

type AppEnv = Env & { GITHUB_APP_PRIVATE_KEY: string };
const LeaseSecondsSchema = z.number().int().min(60).max(900).default(300);
const ProgressSchema = z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= 16_384, "Progress is too large");
const RequestRunSchema = z.object({
  organizationId: z.string().min(1), propertyId: z.string().min(1), caseId: z.string().min(1),
  kind: RunKindSchema, engineRevision: z.string().regex(/^[a-f0-9]{7,64}$/), idempotencyKey: z.string().min(8).max(200),
  executionProvider: ExecutionProviderSchema.default("nebuchadnezzar_worker"), executionPolicy: ExecutionPolicySchema.optional(),
});
const LegacyRequestRunSchema = RequestRunSchema.omit({ organizationId: true, propertyId: true });
const EngineRevisionSchema = z.string().regex(/^[a-f0-9]{40}$/);
const ClaimSchema = z.object({ provider: z.literal("nebuchadnezzar_worker"), workerId: z.string().min(1).max(100), leaseSeconds: LeaseSecondsSchema,
  engineRevision: EngineRevisionSchema.optional() });
const SelftestSchema = z.object({ workerId: z.string().min(1).max(100), engineRevision: EngineRevisionSchema.optional() });
const SELFTEST_LEASE_SECONDS = 120;
const RenewSchema = z.object({ stage: RunStageSchema, progress: ProgressSchema.default({}), leaseSeconds: LeaseSecondsSchema });
const EventSchema = z.object({ eventType: z.enum(["stage", "throttle", "backoff", "lease", "progress", "partial"]), metadata: z.record(z.string(), z.unknown()).default({}) })
  .refine((v) => JSON.stringify(v.metadata).length <= 16_384, "Event metadata is too large");
const CompleteSchema = z.object({ outcome: z.enum(["succeeded", "partial"]), progress: ProgressSchema.default({}) });
const FailSchema = z.object({ error: z.string().min(1).max(4000), progress: ProgressSchema.default({}) });

class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
function json(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers); headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store"); headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { ...init, headers });
}
async function bodyJson(request: Request): Promise<unknown> {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) throw new HttpError(415, "Expected application/json");
  try { return await request.json(); } catch { throw new HttpError(400, "Invalid JSON body"); }
}
function deployedRevision(env: AppEnv): string | null {
  return EngineRevisionSchema.safeParse(env.ENGINE_REVISION).success ? env.ENGINE_REVISION : null;
}
async function operator(request: Request, env: AppEnv, permission: OperatorPermission, store: D1ControlCenterStore) {
  // Browser mutations must be same-origin; runners and CLI callers send no Origin header.
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin !== null && origin !== new URL(request.url).origin) throw new HttpAuthError(403, "Cross-origin operator request refused");
  const actor = await authenticateOperator(request, env);
  if (!actor.email || !await store.authorizeOperator(actor.email, permission)) throw new HttpAuthError(403, `Operator lacks ${permission} permission`);
  return actor;
}
async function propertyForCase(db: D1Database, caseId: string): Promise<{ organizationId: string; propertyId: string; propertyUrl: string } | null> {
  const row = await db.prepare(`SELECT c.organization_id, c.property_id, p.url AS property_url FROM assessment_cases c
    JOIN digital_properties p ON p.id = c.property_id WHERE c.id = ? AND p.active = 1`).bind(caseId)
    .first<{ organization_id: string; property_id: string; property_url: string }>();
  return row ? { organizationId: row.organization_id, propertyId: row.property_id, propertyUrl: row.property_url } : null;
}
function dbRunToApi(row: Record<string, unknown>): unknown {
  return { schema: "art/control-center-run/v1", id: row.id, caseId: row.case_id, propertyId: row.property_id, kind: row.kind,
    state: row.state, idempotencyKey: row.idempotency_key, requestedBy: row.requested_by, requestedAt: row.requested_at,
    startedAt: row.started_at, completedAt: row.completed_at, engineRevision: row.engine_revision,
    executionProvider: row.execution_provider, stage: row.stage, executionPolicy: JSON.parse(String(row.execution_policy_json)),
    workerId: row.worker_id, leaseExpiresAt: row.lease_expires_at, heartbeatAt: row.heartbeat_at, attempt: row.attempt,
    progress: JSON.parse(String(row.progress_json)), error: row.error };
}
function nextAction(state: string): "run" | "review" | "report" | "outreach" | "wait" | "rescan" {
  if (["DISCOVERED", "READY", "QUEUED", "SCANNING"].includes(state)) return "run";
  if (state === "REVIEW") return "review"; if (state === "REPORT_READY") return "report";
  if (state === "OUTREACH_READY") return "outreach"; if (state === "RESCAN_DUE") return "rescan"; return "wait";
}
async function listCases(db: D1Database): Promise<unknown> {
  const result = await db.prepare(`SELECT c.id AS case_id, o.id AS organization_id, o.name AS organization_name,
    o.type AS organization_type, o.canton, p.id AS property_id, p.url AS property_url, c.state AS case_state
    FROM assessment_cases c JOIN organizations o ON o.id = c.organization_id
    JOIN digital_properties p ON p.id = c.property_id ORDER BY o.name, p.url`).all<{
      case_id: string; organization_id: string; organization_name: string; organization_type: string;
      canton: string | null; property_id: string; property_url: string; case_state: string;
    }>();
  const items = await Promise.all(result.results.map(async (row) => {
    const latest = await db.prepare("SELECT * FROM runs WHERE case_id = ? ORDER BY requested_at DESC LIMIT 1").bind(row.case_id).first<Record<string, unknown>>();
    const counts = await db.prepare(`SELECT a.kind, count(*) AS count FROM artifacts a JOIN runs r ON r.id = a.run_id
      WHERE r.case_id = ? GROUP BY a.kind`).bind(row.case_id).all<{ kind: string; count: number }>();
    return { caseId: row.case_id, organizationId: row.organization_id, organizationName: row.organization_name,
      organizationType: row.organization_type, canton: row.canton, propertyId: row.property_id, propertyUrl: row.property_url,
      caseState: row.case_state, latestRun: latest ? dbRunToApi(latest) : null,
      artifactCounts: Object.fromEntries(counts.results.map(({ kind, count }) => [kind, count])),
      needsHumanReview: row.case_state === "REVIEW", nextAction: nextAction(row.case_state) };
  }));
  return { generatedAt: new Date().toISOString(), items };
}
async function runnerFor(request: Request, env: AppEnv, run: Run): Promise<AuthenticatedActor> {
  const actor = run.executionProvider === "github_actions" ? await authenticateGitHubRunner(request, env) : await authenticateNebuchadnezzar(request, env);
  if (actor.provider !== run.executionProvider || !actor.workerId) throw new HttpAuthError(403, "Wrong execution provider");
  return actor;
}
async function requireLease(request: Request, store: D1ControlCenterStore, actor: AuthenticatedActor, runId: string) {
  let raw: string; try { raw = leaseToken(request); } catch { throw new HttpAuthError(401, "Missing or invalid run lease token"); }
  const hash = await hashLeaseToken(raw);
  if (!actor.workerId || !await store.validLease(runId, actor.workerId, hash, new Date().toISOString())) throw new HttpAuthError(403, "Run lease is invalid, expired, or cancelled");
  return hash;
}
async function createRun(request: Request, env: AppEnv, store: D1ControlCenterStore, legacyCaseId?: string) {
  const actor = await operator(request, env, "execute", store); const raw = await bodyJson(request);
  const parsed = legacyCaseId ? LegacyRequestRunSchema.parse(raw) : RequestRunSchema.parse(raw);
  const caseId = legacyCaseId ?? (parsed as z.infer<typeof RequestRunSchema>).caseId;
  const property = await propertyForCase(env.DB, caseId); if (!property) throw new HttpError(404, "Active case property not found");
  if (!legacyCaseId) { const full = parsed as z.infer<typeof RequestRunSchema>;
    if (full.organizationId !== property.organizationId || full.propertyId !== property.propertyId) throw new HttpError(409, "Organization, property, and case do not match"); }
  const input = parsed as z.infer<typeof LegacyRequestRunSchema>; let result: Awaited<ReturnType<typeof requestRun>>;
  try { result = await requestRun(store, { ...input, caseId, propertyId: property.propertyId, requestedBy: actor.id }); }
  catch (error) { const existing = await store.findRunByIdempotencyKey(input.idempotencyKey); if (!existing) throw error;
    if (existing.caseId !== caseId || existing.propertyId !== property.propertyId || existing.kind !== input.kind ||
        existing.engineRevision !== input.engineRevision || existing.executionProvider !== input.executionProvider ||
        (input.executionPolicy !== undefined && JSON.stringify(existing.executionPolicy) !== JSON.stringify(input.executionPolicy)))
      throw new HttpError(409, "Idempotency key collision with different run intent"); result = { run: existing, created: false }; }
  await store.appendAudit(actor.id, result.created ? "run.requested" : "run.request.replayed", "run", result.run.id,
    { idempotencyKey: input.idempotencyKey, executionProvider: result.run.executionProvider });
  await queueWithProvider(env, result.run); return json(result, { status: result.created ? 201 : 200 });
}

async function api(request: Request, env: AppEnv): Promise<Response> {
  const path = new URL(request.url).pathname; const store = new D1ControlCenterStore(env.DB);
  if (request.method === "GET" && path === "/api/v1/health") return json({ ok: true, environment: env.APP_ENV });
  if (request.method === "GET" && path === "/api/v1/cases") { await operator(request, env, "read", store); return json(await listCases(env.DB)); }
  if (request.method === "GET" && path === "/api/v1/runtime") {
    const actor = await operator(request, env, "read", store);
    return json({ environment: env.APP_ENV, engineRevision: deployedRevision(env), operator: actor.email,
      canExecute: await store.authorizeOperator(actor.email!, "execute"), runners: await store.listRunners() });
  }
  if (request.method === "POST" && path === "/api/v1/runs") return createRun(request, env, store);
  let match = path.match(/^\/api\/v1\/cases\/([^/]+)\/runs$/);
  if (request.method === "POST" && match) return createRun(request, env, store, decodeURIComponent(match[1] ?? ""));

  if (request.method === "POST" && path === "/api/v1/runner/claim") {
    const actor = await authenticateNebuchadnezzar(request, env); const input = ClaimSchema.parse(await bodyJson(request));
    if (actor.workerId !== input.workerId || actor.provider !== input.provider) throw new HttpAuthError(403, "Runner identity mismatch");
    const now = new Date(); if (!await store.touchRunner(input.workerId, input.provider, now.toISOString())) throw new HttpAuthError(403, "Runner is disabled or unregistered");
    const rawLease = createLeaseToken(); const run = await store.claimNextRun({ provider: input.provider, workerId: input.workerId,
      now: now.toISOString(), leaseExpiresAt: leaseExpiry(now, input.leaseSeconds), leaseTokenSha256: await hashLeaseToken(rawLease),
      engineRevision: input.engineRevision });
    if (!run) return new Response(null, { status: 204 }); const property = await propertyForCase(env.DB, run.caseId);
    if (!property || property.propertyId !== run.propertyId) throw new HttpError(409, "Run property is unavailable");
    await store.appendRunEvent(run.id, input.workerId, "lease", { action: "claimed", attempt: run.attempt });
    await store.appendAudit(actor.id, "run.claimed", "run", run.id, { provider: input.provider, attempt: run.attempt });
    return json({ run, propertyUrl: property.propertyUrl, leaseToken: rawLease });
  }
  if (request.method === "POST" && path === "/api/v1/runner/selftest") {
    const actor = await authenticateNebuchadnezzar(request, env); const input = SelftestSchema.parse(await bodyJson(request));
    if (actor.workerId !== input.workerId) throw new HttpAuthError(403, "Runner identity mismatch");
    const now = new Date(); if (!await store.touchRunner(input.workerId, "nebuchadnezzar_worker", now.toISOString())) throw new HttpAuthError(403, "Runner is disabled or unregistered");
    const rawLease = createLeaseToken(); const selftest = await store.createSelftest({ workerId: input.workerId,
      engineRevision: input.engineRevision ?? null, now: now.toISOString(), leaseExpiresAt: leaseExpiry(now, SELFTEST_LEASE_SECONDS),
      leaseTokenSha256: await hashLeaseToken(rawLease) });
    await store.appendAudit(actor.id, "runner.selftest.claimed", "runner_selftest", selftest.id, { engineRevision: selftest.engineRevision });
    return json({ selftest, leaseToken: rawLease }, { status: 201 });
  }
  match = path.match(/^\/api\/v1\/runner\/selftest\/([^/]+)\/(heartbeat|complete)$/);
  if (request.method === "POST" && match) {
    const actor = await authenticateNebuchadnezzar(request, env); const id = decodeURIComponent(match[1] ?? "");
    let raw: string; try { raw = leaseToken(request); } catch { throw new HttpAuthError(401, "Missing or invalid run lease token"); }
    const hash = await hashLeaseToken(raw); const now = new Date();
    const selftest = match[2] === "heartbeat"
      ? await store.heartbeatSelftest({ id, workerId: actor.workerId!, leaseTokenSha256: hash, now: now.toISOString(), leaseExpiresAt: leaseExpiry(now, SELFTEST_LEASE_SECONDS) })
      : await store.completeSelftest({ id, workerId: actor.workerId!, leaseTokenSha256: hash, now: now.toISOString() });
    if (!selftest) throw new HttpAuthError(403, "Self-test lease is invalid, expired, or already completed");
    await store.appendAudit(actor.id, `runner.selftest.${match[2] === "heartbeat" ? "heartbeat" : "completed"}`, "runner_selftest", id, { heartbeats: selftest.heartbeats });
    return json({ selftest });
  }
  match = path.match(/^\/api\/v1\/runs\/([^/]+)\/claim$/);
  if (request.method === "POST" && match) {
    const actor = await authenticateGitHubRunner(request, env); const runId = decodeURIComponent(match[1] ?? "");
    const current = await store.getRun(runId); if (!current) throw new HttpError(404, "Run not found");
    if (current.executionProvider !== "github_actions") throw new HttpAuthError(403, "Run is assigned to another provider");
    const now = new Date(); const rawLease = createLeaseToken();
    const run = await store.claimRunById({ id: runId, provider: "github_actions", workerId: actor.workerId!, now: now.toISOString(),
      leaseExpiresAt: leaseExpiry(now, 300), leaseTokenSha256: await hashLeaseToken(rawLease) });
    if (!run) throw new HttpError(409, "Run is not available to claim"); const property = await propertyForCase(env.DB, run.caseId);
    if (!property || property.propertyId !== run.propertyId) throw new HttpError(409, "Run property is unavailable");
    await store.appendRunEvent(run.id, actor.workerId!, "lease", { action: "claimed", attempt: run.attempt });
    await store.appendAudit(actor.id, "run.claimed", "run", run.id, { provider: actor.provider, attempt: run.attempt });
    return json({ run, propertyUrl: property.propertyUrl, leaseToken: rawLease });
  }
  match = path.match(/^\/api\/v1\/runs\/([^/]+)\/cancel$/);
  if (request.method === "POST" && match) {
    const actor = await operator(request, env, "execute", store); const runId = decodeURIComponent(match[1] ?? "");
    const existing = await store.getRun(runId); if (!existing) throw new HttpError(404, "Run not found");
    if (existing.state === "cancelled") return json({ run: existing, replayed: true });
    const run = await store.cancelRun(runId, new Date().toISOString()); if (!run) throw new HttpError(409, "Only queued or running runs can be cancelled");
    await store.appendAudit(actor.id, "run.cancelled", "run", run.id, {}); return json({ run });
  }

  match = path.match(/^\/api\/v1\/runs\/([^/]+)\/(lease\/renew|events|artifacts|complete|fail)$/);
  if (match) {
    const runId = decodeURIComponent(match[1] ?? ""); const action = match[2]; const current = await store.getRun(runId);
    if (!current) throw new HttpError(404, "Run not found"); const actor = await runnerFor(request, env, current);
    const hash = await requireLease(request, store, actor, runId);
    if (request.method === "POST" && action === "lease/renew") {
      const input = RenewSchema.parse(await bodyJson(request)); const now = new Date();
      const run = await store.renewLease({ id: runId, workerId: actor.workerId!, leaseTokenSha256: hash, now: now.toISOString(),
        leaseExpiresAt: leaseExpiry(now, input.leaseSeconds), stage: input.stage, progress: input.progress });
      if (!run) throw new HttpError(409, "Run lease could not be renewed");
      await store.appendRunEvent(runId, actor.workerId!, "lease", { action: "renewed", stage: input.stage }); return json({ run });
    }
    if (request.method === "POST" && action === "events") {
      const input = EventSchema.parse(await bodyJson(request)); await store.appendRunEvent(runId, actor.workerId!, input.eventType, input.metadata);
      if (["throttle", "backoff", "partial"].includes(input.eventType)) await store.appendAudit(actor.id, `run.${input.eventType}`, "run", runId, input.metadata);
      return json({ accepted: true }, { status: 201 });
    }
    if (request.method === "PUT" && action === "artifacts") {
      const digest = request.headers.get("x-artifact-sha256") ?? ""; const kind = ArtifactKindSchema.parse(request.headers.get("x-artifact-kind"));
      const existing = await store.findArtifact(runId, kind, digest); if (existing) return json({ artifact: existing, replayed: true });
      const artifact = await storeArtifact(env.ARTIFACTS, runId, request); await store.addArtifact(artifact);
      await store.appendAudit(actor.id, "artifact.stored", "artifact", artifact.id, { runId, sha256: artifact.sha256, storageKey: artifact.storageKey });
      return json({ artifact }, { status: 201 });
    }
    if (request.method === "POST" && action === "complete") {
      const input = CompleteSchema.parse(await bodyJson(request)); const now = new Date().toISOString();
      const run = await store.finishLeasedRun({ id: runId, workerId: actor.workerId!, leaseTokenSha256: hash, now,
        state: input.outcome, error: null, progress: input.progress }); if (!run) throw new HttpError(409, "Run could not be completed");
      await store.appendAudit(actor.id, `run.${input.outcome}`, "run", runId, {}); return json({ run });
    }
    if (request.method === "POST" && action === "fail") {
      const input = FailSchema.parse(await bodyJson(request)); const now = new Date().toISOString();
      const run = await store.finishLeasedRun({ id: runId, workerId: actor.workerId!, leaseTokenSha256: hash, now,
        state: "failed", error: input.error, progress: input.progress }); if (!run) throw new HttpError(409, "Run could not be failed");
      await store.appendAudit(actor.id, "run.failed", "run", runId, {}); return json({ run });
    }
  }
  match = path.match(/^\/api\/v1\/runs\/([^/]+)\/artifacts\/([^/]+)\/content$/);
  if (request.method === "GET" && match) {
    await operator(request, env, "read", store);
    const runId = decodeURIComponent(match[1] ?? ""), artifactId = decodeURIComponent(match[2] ?? "");
    const artifact = (await store.listArtifactsForRun(runId)).find((item) => item.id === artifactId);
    if (!artifact) throw new HttpError(404, "Artifact not found");
    if (!["report_json", "report_html", "screenshot"].includes(artifact.kind)) throw new HttpError(403, "Artifact kind is not viewable");
    const object = await env.ARTIFACTS.get(artifact.storageKey);
    if (!object) throw new HttpError(404, "Artifact object not found");
    const headers = new Headers({ "content-type": artifact.contentType, "cache-control": "private, no-store",
      "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox" });
    return new Response(object.body, { headers });
  }
  match = path.match(/^\/api\/v1\/runs\/([^/]+)$/);
  if (request.method === "GET" && match) {
    await operator(request, env, "read", store); const runId = decodeURIComponent(match[1] ?? ""); const run = await store.getRun(runId);
    if (!run) throw new HttpError(404, "Run not found"); const events = await env.DB.prepare(`SELECT id, worker_id AS workerId,
      event_type AS eventType, occurred_at AS occurredAt, metadata_json AS metadataJson FROM run_events WHERE run_id = ? ORDER BY occurred_at`)
      .bind(runId).all<Record<string, unknown>>();
    return json({ run, artifacts: await store.listArtifactsForRun(runId), events: events.results.map((event) => ({
      ...event, metadata: JSON.parse(String(event.metadataJson)), metadataJson: undefined })) });
  }
  throw new HttpError(404, "API route not found");
}
function staticHeaders(response: Response): Response {
  const result = new Response(response.body, response); result.headers.set("x-content-type-options", "nosniff");
  result.headers.set("referrer-policy", "no-referrer"); result.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  result.headers.set("content-security-policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"); return result;
}
export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    try {
      if (new URL(request.url).pathname.startsWith("/api/")) return await api(request, env);
      // Defence in depth: the dashboard shell is never served without a valid Access identity,
      // even if the Access application in front of this Worker is misconfigured or removed.
      await authenticateOperator(request, env);
      return staticHeaders(await env.ASSETS.fetch(request));
    }
    catch (error) { if (error instanceof HttpAuthError || error instanceof HttpError) return json({ error: error.message }, { status: error.status });
      if (error instanceof z.ZodError) return json({ error: "Invalid request", issues: error.issues }, { status: 400 });
      console.error(JSON.stringify({ event: "request_failed", message: error instanceof Error ? error.message : "unknown" }));
      return json({ error: "Internal server error" }, { status: 500 }); }
  },
} satisfies ExportedHandler<AppEnv>;
