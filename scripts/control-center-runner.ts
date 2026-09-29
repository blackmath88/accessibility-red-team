import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

type ClaimedRun = {
  run: { id: string; kind: "scan" | "journeys" | "assessment"; engineRevision: string };
  propertyUrl: string;
};

const apiBase = process.env.CONTROL_CENTER_API_URL?.replace(/\/$/, "");
const token = process.env.CONTROL_CENTER_OIDC_TOKEN;
const runId = process.env.CONTROL_CENTER_RUN_ID;
if (!apiBase || !token || !runId) throw new Error("Runner environment is incomplete");

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} failed (${response.status}): ${await response.text()}`);
  return response;
}

function runCommand(command: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: process.env });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => { stdout.push(chunk); process.stdout.write(chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr.push(chunk); process.stderr.write(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
      if (code === 0) resolvePromise(result);
      else reject(Object.assign(new Error(`${command} exited with ${code}`), { result }));
    });
  });
}

async function filesUnder(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(path));
    else if (entry.isFile()) found.push(path);
  }
  return found.sort();
}

function artifactKind(path: string): string {
  const name = basename(path).toLowerCase();
  if (name.includes("manifest")) return "manifest";
  if (name.includes("coverage") || name === "surface.json") return "coverage";
  if (name.includes("journey")) return "journey_results";
  if (name.includes("field-summary")) return "field_summary";
  if (name === "report.json") return "report_json";
  if (name === "report.html") return "report_html";
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "screenshot";
  if (name.endsWith(".json")) return "probe_results";
  return "log";
}

function contentType(path: string): string {
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".png")) return "image/png";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  return "text/plain; charset=utf-8";
}

async function upload(path: string): Promise<void> {
  const data = await readFile(path);
  const digest = createHash("sha256").update(data).digest("hex");
  await api(`/api/v1/runs/${encodeURIComponent(runId!)}/artifacts`, {
    method: "PUT",
    headers: {
      "content-type": contentType(path),
      "content-length": String(data.byteLength),
      "x-artifact-kind": artifactKind(path),
      "x-artifact-sha256": digest,
      "x-artifact-filename": basename(path),
    },
    body: data,
  });
}

const claim = await api(`/api/v1/runs/${encodeURIComponent(runId)}/claim`, { method: "POST" });
const { run, propertyUrl } = await claim.json() as ClaimedRun;
if (process.env.GITHUB_SHA && run.engineRevision !== process.env.GITHUB_SHA) {
  throw new Error(`Checked-out revision ${process.env.GITHUB_SHA} does not match requested ${run.engineRevision}`);
}

const output = resolve("runs", "control-center", run.id);
await mkdir(output, { recursive: true });
let failure: Error | null = null;
try {
  const command = run.kind === "scan" ? "scan" : run.kind === "journeys" ? "journey" : "audit";
  const args = ["run", command, "--", propertyUrl, "--out", output];
  if (run.kind === "assessment") args.push("--profile", "requirements/profiles/ch.federal.yml");
  const result = await runCommand("npm", args, process.cwd());
  await writeFile(join(output, "runner.log"), `${result.stdout}\n${result.stderr}`);
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error));
  const captured = (error as { result?: { stdout: string; stderr: string } }).result;
  await writeFile(join(output, "runner.log"), `${captured?.stdout ?? ""}\n${captured?.stderr ?? ""}\n${failure.stack ?? failure.message}`);
}

for (const path of await filesUnder(output)) {
  if ((await stat(path)).size <= 25 * 1024 * 1024) await upload(path);
  else console.warn(`Skipping oversized artifact: ${relative(output, path)}`);
}

await api(`/api/v1/runs/${encodeURIComponent(runId)}/complete`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(failure ? { state: "failed", error: failure.message } : { state: "succeeded" }),
});
if (failure) throw failure;
