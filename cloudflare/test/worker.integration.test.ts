import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { cohortSeedSql, operatorSeedSql } from "../../src/cohort/seed-sql.js";
import worker from "../src/worker.js";
import { memoryR2, sqliteD1 } from "./sqlite-d1.js";

const TEAM = "observatory-test.cloudflareaccess.com";
const AUD = "test-access-audience";
const CLIENT_ID = "nebuchadnezzar-test.access";
const REV = "a".repeat(40);
const ORIGIN = "https://observatory.example.workers.dev";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) === `https://${TEAM}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] });
  return realFetch(input, init);
}) as typeof fetch;

const sign = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" })
  .setIssuer(`https://${TEAM}`).setAudience(AUD).setIssuedAt().setExpirationTime("5m").sign(privateKey);
const operatorJwt = await sign({ email: "operator@example.org", sub: "op" });
const strangerJwt = await sign({ email: "stranger@example.org", sub: "x" });
const serviceJwt = await sign({ common_name: CLIENT_ID, sub: "" });
const otherServiceJwt = await sign({ common_name: "someone-else.access", sub: "" });

function setup() {
  const { d1, db } = sqliteD1(); const r2 = memoryR2();
  const env = { DB: d1, ARTIFACTS: r2, ASSETS: { fetch: async () => new Response("<!doctype html><title>ok</title>", { headers: { "content-type": "text/html" } }) },
    APP_ENV: "development", ENGINE_REVISION: REV, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, NEBUCHADNEZZAR_ACCESS_CLIENT_ID: CLIENT_ID,
    NEBUCHADNEZZAR_WORKER_ID: "nebuchadnezzar", GITHUB_OWNER: "o", GITHUB_REPO: "r", GITHUB_WORKFLOW: "assessment-runner.yml", GITHUB_REF: "main",
    GITHUB_APP_ID: "PENDING", GITHUB_APP_INSTALLATION_ID: "PENDING", GITHUB_OIDC_AUDIENCE: "aud", GITHUB_APP_PRIVATE_KEY: "" };
  return { db, r2, env };
}
async function seed(db: import("node:sqlite").DatabaseSync) {
  const now = "2026-09-29T00:00:00.000Z";
  db.exec(operatorSeedSql({ email: "Operator@Example.org", displayName: "Test Operator", now }));
  db.exec(cohortSeedSql(await readFile(new URL("../../evaluation/cohorts/zh-so-pilot-v1-wave1.yml", import.meta.url), "utf8"), { caseSuffix: "wave1", now }).sql);
}
type Env = ReturnType<typeof setup>["env"];
async function call(env: Env, method: string, path: string, opts: { jwt?: string; body?: unknown; lease?: string; headers?: Record<string, string>; raw?: BodyInit } = {}) {
  const headers = new Headers(opts.headers);
  if (opts.jwt) headers.set("cf-access-jwt-assertion", opts.jwt);
  if (opts.lease) headers.set("x-run-lease-token", opts.lease);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  const response = await worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers,
    body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)) }), env as never);
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null };
}
const runRequest = (caseId: string, key: string, extra: Record<string, unknown> = {}) => ({
  organizationId: caseId.split(":")[0], propertyId: `${caseId.split(":")[0]}:main-web`, caseId, kind: "assessment",
  engineRevision: REV, idempotencyKey: key, ...extra });
const claimBody = (engineRevision = REV) => ({ provider: "nebuchadnezzar_worker", workerId: "nebuchadnezzar", leaseSeconds: 300, engineRevision });

test("public migrations seed no operator identities", () => {
  const { db } = setup();
  assert.equal((db.prepare("SELECT count(*) AS n FROM operators").get() as { n: number }).n, 0);
});

test("dashboard assets fail closed without a valid Access identity", async () => {
  const { env } = setup();
  assert.equal((await call(env, "GET", "/")).status, 401);
  assert.equal((await call(env, "GET", "/", { jwt: "not-a-jwt" })).status, 401);
  const ok = await call(env, "GET", "/", { jwt: operatorJwt });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  const unconfigured = { ...env, ACCESS_AUD: "PENDING" };
  assert.equal((await call(unconfigured, "GET", "/", { jwt: operatorJwt })).status, 503);
});

test("operator API requires a registered operator and same-origin mutations", async () => {
  const { db, env } = setup(); await seed(db);
  assert.equal((await call(env, "GET", "/api/v1/cases", { jwt: strangerJwt })).status, 403);
  const cases = await call(env, "GET", "/api/v1/cases", { jwt: operatorJwt });
  assert.equal(cases.status, 200);
  assert.equal(cases.body.items.length, 8);
  const runtime = await call(env, "GET", "/api/v1/runtime", { jwt: operatorJwt });
  assert.equal(runtime.body.engineRevision, REV);
  assert.equal(runtime.body.canExecute, true);
  const cross = await call(env, "POST", "/api/v1/runs", { jwt: operatorJwt, body: runRequest("ch-zh-uster:wave1", "k-cross-origin"), headers: { origin: "https://evil.example" } });
  assert.equal(cross.status, 403);
});

test("runner lifecycle: engine-pinned claim, canonical URL, heartbeat, evidence, partial completion", async () => {
  const { db, r2, env } = setup(); await seed(db);
  const created = await call(env, "POST", "/api/v1/runs", { jwt: operatorJwt, body: runRequest("ch-zh-uster:wave1", "k-uster-1"), headers: { origin: ORIGIN } });
  assert.equal(created.status, 201);
  const replay = await call(env, "POST", "/api/v1/runs", { jwt: operatorJwt, body: runRequest("ch-zh-uster:wave1", "k-uster-1") });
  assert.equal(replay.status, 200); assert.equal(replay.body.created, false); assert.equal(replay.body.run.id, created.body.run.id);
  const collision = await call(env, "POST", "/api/v1/runs", { jwt: operatorJwt, body: runRequest("ch-zh-bauma:wave1", "k-uster-1") });
  assert.equal(collision.status, 409);

  assert.equal((await call(env, "POST", "/api/v1/runner/claim", { jwt: otherServiceJwt, body: claimBody() })).status, 403);
  assert.equal((await call(env, "POST", "/api/v1/runner/claim", { jwt: serviceJwt, body: claimBody("b".repeat(40)) })).status, 204);
  const claim = await call(env, "POST", "/api/v1/runner/claim", { jwt: serviceJwt, body: claimBody() });
  assert.equal(claim.status, 200);
  assert.equal(claim.body.propertyUrl, "https://www.uster.ch/");
  assert.equal(claim.body.run.engineRevision, REV);
  const lease = claim.body.leaseToken as string; const runId = claim.body.run.id as string;
  const stored = db.prepare("SELECT lease_token_sha256 FROM runs WHERE id = ?").get(runId) as { lease_token_sha256: string };
  assert.equal(stored.lease_token_sha256, createHash("sha256").update(lease).digest("hex"));

  assert.equal((await call(env, "POST", `/api/v1/runs/${runId}/lease/renew`, { jwt: serviceJwt, body: { stage: "scout" } })).status, 401);
  assert.equal((await call(env, "POST", `/api/v1/runs/${runId}/lease/renew`, { jwt: serviceJwt, lease, body: { stage: "scout" } })).status, 200);
  assert.equal((await call(env, "POST", `/api/v1/runs/${runId}/events`, { jwt: serviceJwt, lease, body: { eventType: "throttle", metadata: { status: 429, retryAfter: "120" } } })).status, 201);

  const evidence = new TextEncoder().encode("{\"ok\":true}"); const digest = createHash("sha256").update(evidence).digest("hex");
  const artifactHeaders = { "content-type": "application/json", "content-length": String(evidence.byteLength), "x-artifact-kind": "probe_results", "x-artifact-sha256": digest };
  const put = await call(env, "PUT", `/api/v1/runs/${runId}/artifacts`, { jwt: serviceJwt, lease, headers: artifactHeaders, raw: evidence });
  assert.equal(put.status, 201); assert.equal(put.body.artifact.storageKey, `sha256/${digest.slice(0, 2)}/${digest}`);
  assert.ok(r2.objects.has(put.body.artifact.storageKey));
  const again = await call(env, "PUT", `/api/v1/runs/${runId}/artifacts`, { jwt: serviceJwt, lease, headers: artifactHeaders, raw: evidence });
  assert.equal(again.body.replayed, true);
  assert.throws(() => db.exec("DELETE FROM artifacts"), /append-only/);

  const done = await call(env, "POST", `/api/v1/runs/${runId}/complete`, { jwt: serviceJwt, lease, body: { outcome: "partial", progress: { partialReason: "HTTP 429" } } });
  assert.equal(done.status, 200); assert.equal(done.body.run.state, "partial");
  assert.equal((await call(env, "POST", `/api/v1/runs/${runId}/complete`, { jwt: serviceJwt, lease, body: { outcome: "succeeded" } })).status, 403);
  const detail = await call(env, "GET", `/api/v1/runs/${runId}`, { jwt: operatorJwt });
  assert.deepEqual(detail.body.events.map((e: { eventType: string }) => e.eventType), ["lease", "lease", "throttle"]);
});

test("cancellation invalidates the lease", async () => {
  const { db, env } = setup(); await seed(db);
  await call(env, "POST", "/api/v1/runs", { jwt: operatorJwt, body: runRequest("ch-so-messen:wave1", "k-messen-1") });
  const claim = await call(env, "POST", "/api/v1/runner/claim", { jwt: serviceJwt, body: claimBody() });
  const runId = claim.body.run.id as string; const lease = claim.body.leaseToken as string;
  assert.equal((await call(env, "POST", `/api/v1/runs/${runId}/cancel`, { jwt: operatorJwt, body: {} })).status, 200);
  assert.equal((await call(env, "POST", `/api/v1/runs/${runId}/lease/renew`, { jwt: serviceJwt, lease, body: { stage: "probes" } })).status, 403);
});

test("per-host concurrency is 1 across properties and providers; retry budget is bounded", async () => {
  const { db, env } = setup(); await seed(db);
  db.exec(`INSERT INTO digital_properties (id, schema_version, organization_id, kind, url, active) VALUES
    ('ch-zh-uster:portal', 'art/control-center-property/v1', 'ch-zh-uster', 'portal', 'https://WWW.USTER.CH/online', 1);
    INSERT INTO assessment_cases (id, schema_version, organization_id, property_id, kind, state, created_at, updated_at) VALUES
    ('ch-zh-uster:portal-case', 'art/control-center-case/v1', 'ch-zh-uster', 'ch-zh-uster:portal', 'accessibility_assessment', 'READY', '2026-09-29T00:00:00.000Z', '2026-09-29T00:00:00.000Z');`);
  assert.equal((db.prepare("SELECT host_key FROM digital_properties WHERE id = 'ch-zh-uster:portal'").get() as { host_key: string }).host_key, "www.uster.ch");
  db.exec(`INSERT INTO digital_properties (id, schema_version, organization_id, kind, url, active) VALUES
    ('ch-zh-uster:fqdn', 'art/control-center-property/v1', 'ch-zh-uster', 'website', 'https://www.uster.ch./', 0),
    ('ch-zh-uster:bare', 'art/control-center-property/v1', 'ch-zh-uster', 'website', 'https://Www.Uster.CH', 0);`);
  assert.deepEqual(db.prepare("SELECT DISTINCT host_key FROM digital_properties WHERE organization_id = 'ch-zh-uster'").all().map((r) => ({ ...r })), [{ host_key: "www.uster.ch" }]);
  assert.throws(() => db.exec("UPDATE digital_properties SET url = 'https://attacker.example/' WHERE id = 'ch-zh-uster:main-web'"), /canonical/);

  await call(env, "POST", "/api/v1/runs", { jwt: operatorJwt, body: runRequest("ch-zh-uster:wave1", "k-host-1") });
  await call(env, "POST", "/api/v1/runs", { jwt: operatorJwt, body: { ...runRequest("ch-zh-uster:portal-case", "k-host-2"), propertyId: "ch-zh-uster:portal" } });
  await call(env, "POST", "/api/v1/runs", { jwt: operatorJwt, body: runRequest("ch-zh-bauma:wave1", "k-host-3") });
  const first = await call(env, "POST", "/api/v1/runner/claim", { jwt: serviceJwt, body: claimBody() });
  const second = await call(env, "POST", "/api/v1/runner/claim", { jwt: serviceJwt, body: claimBody() });
  assert.equal(first.body.propertyUrl, "https://www.uster.ch/");
  assert.equal(second.body.propertyUrl, "https://www.bauma.ch/", "same-host run must wait while uster.ch is leased");
  assert.equal((await call(env, "POST", "/api/v1/runner/claim", { jwt: serviceJwt, body: claimBody() })).status, 204);

  db.exec(`UPDATE runs SET lease_expires_at = '2000-01-01T00:00:00.000Z', attempt = 3 WHERE id = '${first.body.run.id}'`);
  const third = await call(env, "POST", "/api/v1/runner/claim", { jwt: serviceJwt, body: claimBody() });
  assert.equal(third.body.propertyUrl, "https://WWW.USTER.CH/online", "exhausted run is not reclaimed; the host is free again");
});

test("runner self-test exercises auth, lease and heartbeat without touching the run queue", async () => {
  const { db, env } = setup(); await seed(db);
  assert.equal((await call(env, "POST", "/api/v1/runner/selftest", { jwt: otherServiceJwt, body: { workerId: "nebuchadnezzar" } })).status, 403);
  assert.equal((await call(env, "POST", "/api/v1/runner/selftest", { jwt: serviceJwt, body: { workerId: "impostor" } })).status, 403);
  const started = await call(env, "POST", "/api/v1/runner/selftest", { jwt: serviceJwt, body: { workerId: "nebuchadnezzar", engineRevision: REV } });
  assert.equal(started.status, 201);
  const id = started.body.selftest.id as string; const lease = started.body.leaseToken as string;
  assert.equal((await call(env, "POST", `/api/v1/runner/selftest/${id}/complete`, { jwt: serviceJwt, lease, body: {} })).status, 403, "completion requires a heartbeat");
  assert.equal((await call(env, "POST", `/api/v1/runner/selftest/${id}/heartbeat`, { jwt: serviceJwt, lease: "x".repeat(43), body: {} })).status, 403);
  assert.equal((await call(env, "POST", `/api/v1/runner/selftest/${id}/heartbeat`, { jwt: serviceJwt, lease, body: {} })).body.selftest.heartbeats, 1);
  assert.equal((await call(env, "POST", `/api/v1/runner/selftest/${id}/complete`, { jwt: serviceJwt, lease, body: {} })).body.selftest.state, "completed");
  assert.equal((await call(env, "POST", `/api/v1/runner/selftest/${id}/complete`, { jwt: serviceJwt, lease, body: {} })).status, 403);
  assert.equal((db.prepare("SELECT count(*) AS n FROM runs").get() as { n: number }).n, 0);
  const runtime = await call(env, "GET", "/api/v1/runtime", { jwt: operatorJwt });
  assert.ok(runtime.body.runners.find((r: { id: string; lastSeenAt: string | null }) => r.id === "nebuchadnezzar")?.lastSeenAt);
  const actions = (db.prepare("SELECT action FROM audit_events ORDER BY occurred_at").all() as Array<{ action: string }>).map((r) => r.action);
  assert.deepEqual(actions, ["runner.selftest.claimed", "runner.selftest.heartbeat", "runner.selftest.completed"]);
});
