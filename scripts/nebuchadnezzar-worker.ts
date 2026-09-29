import { spawn } from "node:child_process";
import { cleanEngineRevision } from "./lib/engine-revision.js";

const apiBase = process.env.CONTROL_CENTER_API_URL?.replace(/\/$/, "");
const clientId = process.env.CF_ACCESS_CLIENT_ID;
const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
const workerId = process.env.CONTROL_CENTER_WORKER_ID ?? "nebuchadnezzar";
const pollMs = Number(process.env.CONTROL_CENTER_POLL_MS ?? "15000");
if (!apiBase || !clientId || !clientSecret) throw new Error("Nebuchadnezzar worker environment is incomplete");
if (!Number.isInteger(pollMs) || pollMs < 5000 || pollMs > 300_000) throw new Error("CONTROL_CENTER_POLL_MS must be 5000..300000");

const engineRevision = cleanEngineRevision();
console.log(JSON.stringify({ event: "worker_started", workerId, engineRevision, pollMs }));

let stopping = false; process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function claim(): Promise<unknown | null> {
  const response = await fetch(`${apiBase}/api/v1/runner/claim`, { method: "POST", headers: {
    "content-type": "application/json", "CF-Access-Client-Id": clientId!, "CF-Access-Client-Secret": clientSecret!,
  }, body: JSON.stringify({ provider: "nebuchadnezzar_worker", workerId, leaseSeconds: 300, engineRevision }), redirect: "manual" });
  if (response.status === 204) return null;
  if (response.status >= 300 && response.status < 400) throw new Error(`Claim redirected (${response.status}): Access did not accept the service token`);
  if (!response.ok) throw new Error(`Claim failed (${response.status}): ${await response.text()}`);
  return response.json();
}
function execute(claimed: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/control-center-runner.ts"], { stdio: "inherit", env: {
      ...process.env, CONTROL_CENTER_CLAIM_JSON: Buffer.from(JSON.stringify(claimed)).toString("base64url"), CONTROL_CENTER_WORKER_ID: workerId, CONTROL_CENTER_ENGINE_REVISION: engineRevision,
    } }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Runner exited with ${code}`)));
  });
}
while (!stopping) {
  try { const claimed = await claim(); if (claimed) await execute(claimed); else await wait(pollMs); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); if (!stopping) await wait(Math.max(pollMs, 30_000)); }
}
