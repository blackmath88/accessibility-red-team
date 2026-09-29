import { z } from "zod";
import { requestRun } from "../../src/control-center/commands.js";
import { ArtifactKindSchema, RunKindSchema, type Run } from "../../src/control-center/contracts.js";
import { authenticateOperator, authenticateRunner, HttpAuthError } from "./auth.js";
import { D1ControlCenterStore } from "./d1-store.js";
import { dispatchAssessmentRun } from "./github.js";
import { storeArtifact } from "./r2-artifacts.js";

type AppEnv = Env & { GITHUB_APP_PRIVATE_KEY: string };

const RequestRunSchema = z.object({
  kind: RunKindSchema,
  engineRevision: z.string().regex(/^[a-f0-9]{7,64}$/),
  idempotencyKey: z.string().min(8).max(200),
});
const CompleteRunSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("succeeded") }),
  z.object({ state: z.literal("failed"), error: z.string().min(1).max(4000) }),
]);

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function json(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { ...init, headers });
}

async function bodyJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/json")) throw new HttpError(415, "Expected application/json");
  try { return await request.json(); } catch { throw new HttpError(400, "Invalid JSON body"); }
}

async function caseProperty(db: D1Database, caseId: string): Promise<{ propertyId: string; propertyUrl: string } | null> {
  const row = await db.prepare(`SELECT c.property_id, p.url AS property_url
    FROM assessment_cases c JOIN digital_properties p ON p.id = c.property_id
    WHERE c.id = ? AND p.active = 1`).bind(caseId)
    .first<{ property_id: string; property_url: string }>();
  return row ? { propertyId: row.property_id, propertyUrl: row.property_url } : null;
}

async function listCases(db: D1Database): Promise<unknown> {
  const result = await db.prepare(`SELECT c.id AS case_id, o.id AS organization_id,
    o.name AS organization_name, o.type AS organization_type, o.canton,
    p.id AS property_id, p.url AS property_url, c.state AS case_state
    FROM assessment_cases c
    JOIN organizations o ON o.id = c.organization_id
    JOIN digital_properties p ON p.id = c.property_id
    ORDER BY o.name, p.url`).all<{
      case_id: string; organization_id: string; organization_name: string;
      organization_type: string; canton: string | null; property_id: string;
      property_url: string; case_state: string;
    }>();

  const items = await Promise.all(result.results.map(async (row) => {
    const latest = await db.prepare("SELECT * FROM runs WHERE case_id = ? ORDER BY requested_at DESC LIMIT 1")
      .bind(row.case_id).first<Record<string, unknown>>();
    const counts = await db.prepare(`SELECT a.kind, count(*) AS count FROM artifacts a
      JOIN runs r ON r.id = a.run_id WHERE r.case_id = ? GROUP BY a.kind`)
      .bind(row.case_id).all<{ kind: string; count: number }>();
    const artifactCounts = Object.fromEntries(counts.results.map(({ kind, count }) => [kind, count]));
    return {
      caseId: row.case_id, organizationId: row.organization_id,
      organizationName: row.organization_name, organizationType: row.organization_type,
      canton: row.canton, propertyId: row.property_id, propertyUrl: row.property_url,
      caseState: row.case_state, latestRun: latest ? dbRunToApi(latest) : null,
      artifactCounts, needsHumanReview: row.case_state === "REVIEW",
      nextAction: nextAction(row.case_state),
    };
  }));
  return { generatedAt: new Date().toISOString(), items };
}

function dbRunToApi(row: Record<string, unknown>): unknown {
  return {
    schema: "art/control-center-run/v1", id: row.id, caseId: row.case_id,
    propertyId: row.property_id, kind: row.kind, state: row.state,
    idempotencyKey: row.idempotency_key, requestedBy: row.requested_by,
    requestedAt: row.requested_at, startedAt: row.started_at,
    completedAt: row.completed_at, engineRevision: row.engine_revision, error: row.error,
  };
}

function nextAction(state: string): "run" | "review" | "report" | "outreach" | "wait" | "rescan" {
  if (["DISCOVERED", "READY", "QUEUED", "SCANNING"].includes(state)) return "run";
  if (state === "REVIEW") return "review";
  if (state === "REPORT_READY") return "report";
  if (state === "OUTREACH_READY") return "outreach";
  if (state === "RESCAN_DUE") return "rescan";
  return "wait";
}

async function dispatchIfNeeded(env: AppEnv, run: Run): Promise<void> {
  const now = new Date().toISOString();
  const current = await env.DB.prepare("SELECT state FROM workflow_dispatches WHERE run_id = ?")
    .bind(run.id).first<{ state: string }>();
  if (current?.state === "dispatched" || current?.state === "dispatching") return;

  const claimed = current
    ? await env.DB.prepare(`UPDATE workflow_dispatches SET state = 'dispatching', attempts = attempts + 1,
        last_error = NULL, updated_at = ? WHERE run_id = ? AND state = 'failed'`).bind(now, run.id).run()
    : await env.DB.prepare(`INSERT OR IGNORE INTO workflow_dispatches
        (run_id, state, attempts, updated_at) VALUES (?, 'dispatching', 1, ?)`).bind(run.id, now).run();
  if (claimed.meta.changes !== 1) return;

  try {
    const dispatched = await dispatchAssessmentRun(env, run.id, run.engineRevision);
    await env.DB.prepare(`UPDATE workflow_dispatches SET state = 'dispatched', github_run_id = ?,
      updated_at = ? WHERE run_id = ?`).bind(dispatched.workflowRunId, new Date().toISOString(), run.id).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dispatch failed";
    await env.DB.prepare(`UPDATE workflow_dispatches SET state = 'failed', last_error = ?,
      updated_at = ? WHERE run_id = ?`).bind(message, new Date().toISOString(), run.id).run();
    throw error;
  }
}

async function api(request: Request, env: AppEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const store = new D1ControlCenterStore(env.DB);

  if (request.method === "GET" && path === "/api/v1/health") {
    return json({ ok: true, environment: env.APP_ENV });
  }
  if (request.method === "GET" && path === "/api/v1/cases") {
    await authenticateOperator(request, env, "read");
    return json(await listCases(env.DB));
  }

  let match = path.match(/^\/api\/v1\/cases\/([^/]+)\/runs$/);
  if (request.method === "POST" && match) {
    const actor = await authenticateOperator(request, env, "execute");
    const caseId = decodeURIComponent(match[1] ?? "");
    const property = await caseProperty(env.DB, caseId);
    if (!property) throw new HttpError(404, "Active case property not found");
    const input = RequestRunSchema.parse(await bodyJson(request));
    let result: Awaited<ReturnType<typeof requestRun>>;
    try {
      result = await requestRun(store, {
        ...input, caseId, propertyId: property.propertyId, requestedBy: actor.id,
      });
    } catch (error) {
      const existing = await store.findRunByIdempotencyKey(input.idempotencyKey);
      if (!existing) throw error;
      if (existing.caseId !== caseId || existing.propertyId !== property.propertyId || existing.kind !== input.kind) {
        throw new HttpError(409, "Idempotency key collision with different run intent");
      }
      result = { run: existing, created: false };
    }
    await store.appendAudit(actor.id, result.created ? "run.requested" : "run.request.replayed", "run", result.run.id, {
      idempotencyKey: input.idempotencyKey,
    });
    await dispatchIfNeeded(env, result.run);
    return json(result, { status: result.created ? 201 : 200 });
  }

  match = path.match(/^\/api\/v1\/runs\/([^/]+)\/claim$/);
  if (request.method === "POST" && match) {
    const actor = await authenticateRunner(request, env);
    const runId = decodeURIComponent(match[1] ?? "");
    const run = await store.claimRun(runId, new Date().toISOString());
    if (!run) throw new HttpError(409, "Run is not available to claim");
    const property = await caseProperty(env.DB, run.caseId);
    if (!property || property.propertyId !== run.propertyId) throw new HttpError(409, "Run property is unavailable");
    await store.appendAudit(actor.id, "run.claimed", "run", run.id, {});
    return json({ run, propertyUrl: property.propertyUrl });
  }

  match = path.match(/^\/api\/v1\/runs\/([^/]+)\/artifacts$/);
  if (request.method === "PUT" && match) {
    const actor = await authenticateRunner(request, env);
    const runId = decodeURIComponent(match[1] ?? "");
    const run = await store.getRun(runId);
    if (!run) throw new HttpError(404, "Run not found");
    if (run.state !== "running") throw new HttpError(409, "Artifacts may only be attached to a running run");
    const digest = request.headers.get("x-artifact-sha256") ?? "";
    const kind = ArtifactKindSchema.parse(request.headers.get("x-artifact-kind"));
    const existing = await store.findArtifact(runId, kind, digest);
    if (existing) return json({ artifact: existing, replayed: true });
    const artifact = await storeArtifact(env.ARTIFACTS, runId, request);
    await store.addArtifact(artifact);
    await store.appendAudit(actor.id, "artifact.stored", "artifact", artifact.id, {
      runId, sha256: artifact.sha256, storageKey: artifact.storageKey,
    });
    return json({ artifact }, { status: 201 });
  }

  match = path.match(/^\/api\/v1\/runs\/([^/]+)\/complete$/);
  if (request.method === "POST" && match) {
    const actor = await authenticateRunner(request, env);
    const runId = decodeURIComponent(match[1] ?? "");
    const completion = CompleteRunSchema.parse(await bodyJson(request));
    const current = await store.getRun(runId);
    if (!current) throw new HttpError(404, "Run not found");
    if (["succeeded", "failed", "cancelled"].includes(current.state)) {
      if (current.state === completion.state &&
          (completion.state === "succeeded" || current.error === completion.error)) {
        return json({ run: current, replayed: true });
      }
      throw new HttpError(409, "Run is already terminal");
    }
    const completed: Run = {
      ...current, state: completion.state, completedAt: new Date().toISOString(),
      error: completion.state === "failed" ? completion.error : null,
    };
    await store.updateRun(completed);
    await store.appendAudit(actor.id, `run.${completion.state}`, "run", runId, {});
    return json({ run: completed });
  }

  match = path.match(/^\/api\/v1\/runs\/([^/]+)$/);
  if (request.method === "GET" && match) {
    await authenticateOperator(request, env, "read");
    const runId = decodeURIComponent(match[1] ?? "");
    const run = await store.getRun(runId);
    if (!run) throw new HttpError(404, "Run not found");
    return json({ run, artifacts: await store.listArtifactsForRun(runId) });
  }

  throw new HttpError(404, "API route not found");
}

function staticHeaders(response: Response): Response {
  const result = new Response(response.body, response);
  result.headers.set("x-content-type-options", "nosniff");
  result.headers.set("referrer-policy", "no-referrer");
  result.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  result.headers.set("content-security-policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  return result;
}

export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    try {
      if (new URL(request.url).pathname.startsWith("/api/")) return await api(request, env);
      return staticHeaders(await env.ASSETS.fetch(request));
    } catch (error) {
      if (error instanceof HttpAuthError || error instanceof HttpError) {
        return json({ error: error.message }, { status: error.status });
      }
      if (error instanceof z.ZodError) return json({ error: "Invalid request", issues: error.issues }, { status: 400 });
      console.error(JSON.stringify({ event: "request_failed", message: error instanceof Error ? error.message : "unknown" }));
      return json({ error: "Internal server error" }, { status: 500 });
    }
  },
} satisfies ExportedHandler<AppEnv>;
