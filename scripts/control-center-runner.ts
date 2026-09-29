import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

type ClaimedRun = {
  run: { id: string; kind: "scan" | "journeys" | "assessment"; engineRevision: string; executionPolicy: {
    delayMs: number; maxRetries: number; baseBackoffMs: number; maxBackoffMs: number;
  } };
  propertyUrl: string;
  leaseToken: string;
};

const apiBase = process.env.CONTROL_CENTER_API_URL?.replace(/\/$/, "");
const oidcToken = process.env.CONTROL_CENTER_OIDC_TOKEN;
const oidcRequestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const oidcRequestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const accessClientId = process.env.CF_ACCESS_CLIENT_ID;
const accessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
const runId = process.env.CONTROL_CENTER_RUN_ID;
if (!apiBase || (!oidcToken && !(oidcRequestUrl && oidcRequestToken) && (!accessClientId || !accessClientSecret))) throw new Error("Runner authentication environment is incomplete");

let claim: ClaimedRun;
let activeLease = "";
async function githubOidcToken(): Promise<string | null> {
  if (oidcRequestUrl && oidcRequestToken) {
    const url = new URL(oidcRequestUrl); url.searchParams.set("audience", "accessibility-observatory-control-plane");
    const response = await fetch(url, { headers: { authorization: `Bearer ${oidcRequestToken}` } });
    if (!response.ok) throw new Error(`GitHub OIDC mint failed (${response.status})`);
    const body = await response.json() as { value?: string };
    if (!body.value) throw new Error("GitHub OIDC response omitted token");
    return body.value;
  }
  return oidcToken ?? null;
}
async function authHeaders(): Promise<Headers> {
  const headers = new Headers();
  const githubToken = await githubOidcToken();
  if (githubToken) headers.set("authorization", `Bearer ${githubToken}`);
  else { headers.set("CF-Access-Client-Id", accessClientId!); headers.set("CF-Access-Client-Secret", accessClientSecret!); }
  if (activeLease) headers.set("x-run-lease-token", activeLease);
  return headers;
}
async function api(path: string, init: RequestInit = {}, allowNoContent = false): Promise<Response> {
  const headers = await authHeaders(); new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(`${apiBase}${path}`, { ...init, headers, redirect: "manual" });
  if (allowNoContent && response.status === 204) return response;
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} failed (${response.status}): ${await response.text()}`);
  return response;
}
function runCommand(command: string, args: string[], cwd: string, signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: process.env }); const stdout: Buffer[] = []; const stderr: Buffer[] = [];
    const abort = () => { child.kill("SIGTERM"); };
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => { stdout.push(chunk); process.stdout.write(chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr.push(chunk); process.stderr.write(chunk); }); child.on("error", reject);
    child.on("close", (code) => { signal?.removeEventListener("abort", abort); const result = { stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
      if (code === 0) resolvePromise(result); else reject(Object.assign(new Error(`${command} exited with ${code}`), { result })); });
  });
}
async function filesUnder(root: string): Promise<string[]> {
  const found: string[] = []; for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name); if (entry.isDirectory()) found.push(...await filesUnder(path)); else if (entry.isFile()) found.push(path);
  } return found.sort();
}
function artifactKind(path: string): string {
  const name = basename(path).toLowerCase(); if (name.includes("manifest")) return "manifest";
  if (name.includes("coverage") || name === "surface.json") return "coverage"; if (name.includes("journey")) return "journey_results";
  if (name.includes("field-summary")) return "field_summary"; if (name === "report.json") return "report_json";
  if (name === "report.html") return "report_html"; if (/\.(png|jpe?g)$/.test(name)) return "screenshot";
  if (name.endsWith(".json")) return "probe_results"; return "log";
}
function contentType(path: string): string {
  if (path.endsWith(".json")) return "application/json"; if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".png")) return "image/png"; if (/\.jpe?g$/i.test(path)) return "image/jpeg"; return "text/plain; charset=utf-8";
}
async function upload(path: string): Promise<void> {
  const data = await readFile(path); const digest = createHash("sha256").update(data).digest("hex");
  await api(`/api/v1/runs/${encodeURIComponent(claim.run.id)}/artifacts`, { method: "PUT", headers: {
    "content-type": contentType(path), "content-length": String(data.byteLength), "x-artifact-kind": artifactKind(path),
    "x-artifact-sha256": digest, "x-artifact-filename": basename(path) }, body: data });
}
async function renew(stage: string, progress: Record<string, unknown> = {}): Promise<void> {
  await api(`/api/v1/runs/${encodeURIComponent(claim.run.id)}/lease/renew`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ stage, progress, leaseSeconds: 300 }) });
}

const preclaimed = process.env.CONTROL_CENTER_CLAIM_JSON;
if (preclaimed) claim = JSON.parse(Buffer.from(preclaimed, "base64url").toString("utf8")) as ClaimedRun;
else {
  if (!runId || (!oidcToken && !(oidcRequestUrl && oidcRequestToken))) throw new Error("GitHub runner requires CONTROL_CENTER_RUN_ID and GitHub OIDC environment");
  claim = await (await api(`/api/v1/runs/${encodeURIComponent(runId)}/claim`, { method: "POST" })).json() as ClaimedRun;
}
activeLease = claim.leaseToken;
const localRevision = process.env.GITHUB_SHA ?? process.env.CONTROL_CENTER_ENGINE_REVISION;
if (!localRevision || claim.run.engineRevision !== localRevision) throw new Error(`Checked-out revision ${localRevision ?? "unknown"} does not match requested ${claim.run.engineRevision}`);

const output = resolve("runs", "control-center", claim.run.id); await mkdir(output, { recursive: true });
let failure: Error | null = null; let heartbeatFailure: Error | null = null;
const execution = new AbortController();
const heartbeat = setInterval(() => { void renew("probes", { heartbeat: new Date().toISOString() }).catch((e) => {
  heartbeatFailure = e instanceof Error ? e : new Error(String(e)); execution.abort();
}); }, 120_000);
try {
  await renew(claim.run.kind === "journeys" ? "journeys" : claim.run.kind === "assessment" ? "scout" : "probes");
  const command = claim.run.kind === "scan" ? "scan" : claim.run.kind === "journeys" ? "journey" : "audit";
  const args = ["run", command, "--", claim.propertyUrl, "--out", output];
  // Bounded crawl, matching the deterministic Nebuchadnezzar pilot settings.
  if (claim.run.kind === "assessment") args.push("--profile", "requirements/profiles/ch.federal.yml", "--journeys", "--max-pages", "6", "--max-depth", "2");
  args.push("--host-safe", "--delay-ms", String(claim.run.executionPolicy.delayMs),
    "--max-retries", String(claim.run.executionPolicy.maxRetries), "--base-backoff-ms", String(claim.run.executionPolicy.baseBackoffMs),
    "--max-backoff-ms", String(claim.run.executionPolicy.maxBackoffMs));
  const result = await runCommand("npm", args, process.cwd(), execution.signal); await writeFile(join(output, "runner.log"), `${result.stdout}\n${result.stderr}`);
  if (heartbeatFailure) throw heartbeatFailure;
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error)); const captured = (error as { result?: { stdout: string; stderr: string } }).result;
  await writeFile(join(output, "runner.log"), `${captured?.stdout ?? ""}\n${captured?.stderr ?? ""}\n${failure.stack ?? failure.message}`);
} finally { clearInterval(heartbeat); }

let recordedPartial = false;
try {
  await renew("uploading", { executionComplete: true, failed: Boolean(failure) });
  const policyLogPath = join(output, "execution-policy.json");
  try {
    const policyLog = JSON.parse(await readFile(policyLogPath, "utf8")) as { events?: Array<Record<string, unknown>> };
    for (const event of policyLog.events ?? []) {
      await api(`/api/v1/runs/${encodeURIComponent(claim.run.id)}/events`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventType: "backoff", metadata: event }) });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const artifactPaths = await filesUnder(output);
  const hasEvidence = artifactPaths.some((path) => !["runner.log", "execution-policy.json"].includes(basename(path)));
  if (failure && hasEvidence) {
    await api(`/api/v1/runs/${encodeURIComponent(claim.run.id)}/events`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventType: "partial", metadata: { reason: failure.message, retainedEvidence: true } }) });
  }
  for (const path of artifactPaths) {
    if ((await stat(path)).size <= 25 * 1024 * 1024) await upload(path); else console.warn(`Skipping oversized artifact: ${relative(output, path)}`);
  }
  await renew("finalizing", { artifactsUploaded: true });
  const partial = Boolean(failure && hasEvidence); recordedPartial = partial;
  await api(`/api/v1/runs/${encodeURIComponent(claim.run.id)}/${failure && !partial ? "fail" : "complete"}`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(failure && !partial ? { error: failure.message, progress: { artifactsUploaded: true } }
      : { outcome: partial ? "partial" : "succeeded", progress: { artifactsUploaded: true, partialReason: partial ? failure?.message : null } }) });
} catch (error) { failure = error instanceof Error ? error : new Error(String(error)); recordedPartial = false; }
if (failure && !recordedPartial) throw failure;
