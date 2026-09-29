import { cleanEngineRevision } from "./lib/engine-revision.js";

// Harmless end-to-end check of the outbound runner path: Access service auth → claim → heartbeat
// → completion. It never touches the run queue or any assessed site. Credentials are read from
// the environment and are never printed.
const apiBase = process.env.CONTROL_CENTER_API_URL?.replace(/\/$/, "");
const clientId = process.env.CF_ACCESS_CLIENT_ID;
const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
const workerId = process.env.CONTROL_CENTER_WORKER_ID ?? "nebuchadnezzar";
if (!apiBase || !clientId || !clientSecret) throw new Error("Self-test environment is incomplete (CONTROL_CENTER_API_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET)");
if (!apiBase.startsWith("https://")) throw new Error("CONTROL_CENTER_API_URL must be https://");

const engineRevision = cleanEngineRevision();
function step(name: string, detail: Record<string, unknown> = {}): void { console.log(JSON.stringify({ step: name, ok: true, ...detail })); }
async function post(path: string, body: unknown, leaseToken?: string): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { "content-type": "application/json", "CF-Access-Client-Id": clientId!, "CF-Access-Client-Secret": clientSecret! };
  if (leaseToken) headers["x-run-lease-token"] = leaseToken;
  const response = await fetch(`${apiBase}${path}`, { method: "POST", headers, body: JSON.stringify(body), redirect: "manual" });
  if (response.status >= 300 && response.status < 400) throw new Error(`${path}: redirected (${response.status}); the Access service token was not accepted by the Access application`);
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

const claimed = await post("/api/v1/runner/selftest", { workerId, engineRevision });
const selftest = claimed.selftest as { id: string }; const lease = String(claimed.leaseToken);
step("authenticated_and_claimed", { selftestId: selftest.id, workerId, engineRevision });
const beat = await post(`/api/v1/runner/selftest/${encodeURIComponent(selftest.id)}/heartbeat`, {}, lease);
step("heartbeat", { heartbeats: (beat.selftest as { heartbeats: number }).heartbeats });
const done = await post(`/api/v1/runner/selftest/${encodeURIComponent(selftest.id)}/complete`, {}, lease);
step("completed", { state: (done.selftest as { state: string }).state });
console.log(JSON.stringify({ selftest: "PASS", selftestId: selftest.id }));
