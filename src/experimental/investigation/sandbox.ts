// Experimental investigation slice (ADR-0015, docs/experiments/BASEL_ADAPTIVE_INVESTIGATION_MILESTONE.md).
// Nothing outside src/experimental/ imports this module.
//
// Runs model-generated JavaScript in a bubblewrap sandbox: all namespaces unshared (no network), read-only /usr only,
// empty environment, private /tmp, no home directory or repository mounts, die-with-parent, CPU/process limits, a hard
// wall-clock kill and output caps. The ONLY capability is a request channel to a host-side handler (the measurement
// broker), carried as NDJSON over stdin/stdout and checked against a per-attempt random token. Static lint, a judge
// approval or Node's vm module are NOT the boundary; the sandbox is.
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SANDBOX_VERSION = "ail-sandbox/v1";

export type SandboxLimits = { wallMs: number; maxCalls: number; maxLineBytes: number; maxOutputBytes: number; cpuSeconds: number; heapMb: number };
export const DEFAULT_LIMITS: SandboxLimits = { wallMs: 90_000, maxCalls: 120, maxLineBytes: 64_000, maxOutputBytes: 512_000, cpuSeconds: 30, heapMb: 256 };

export type CallHandler = (op: string, args: unknown) => Promise<{ ok: true; result: unknown } | { ok: false; reason: string }>;
export type SandboxOutcome = {
  sandbox: string; codeSha256: string; state: "completed" | "error" | "timeout" | "limit" | "crashed";
  result: unknown; error: string | null; calls: Array<{ op: string; ok: boolean; reason?: string }>; violations: string[]; durationMs: number;
};

export function sandboxAvailable(): { ok: boolean; detail: string } {
  try {
    execFileSync("bwrap", ["--unshare-all", "--ro-bind", "/usr", "/usr", "--symlink", "usr/lib", "/lib", "--ro-bind", "/lib64", "/lib64", "/usr/bin/true"], { stdio: "pipe" });
    return { ok: true, detail: "bwrap with unshared user/net namespaces" };
  } catch (error) {
    return { ok: false, detail: `bwrap unavailable: ${String(error).slice(0, 200)}` };
  }
}

export async function runInSandbox(code: string, packet: unknown, handler: CallHandler | null, limits: SandboxLimits = DEFAULT_LIMITS): Promise<SandboxOutcome> {
  const started = Date.now();
  const codeSha256 = createHash("sha256").update(code).digest("hex");
  const dir = await mkdtemp(join(tmpdir(), "ail-"));
  const probe = join(dir, "probe.mjs");
  await writeFile(probe, code, { mode: 0o444 });
  const token = randomBytes(16).toString("hex");
  const node = realpathSync(process.execPath);
  const args = [
    "--unshare-all", "--die-with-parent", "--new-session", "--clearenv",
    "--ro-bind", "/usr", "/usr", "--ro-bind", "/lib64", "/lib64", "--symlink", "usr/lib", "/lib",
    "--ro-bind", node, "/node", "--ro-bind", join(HERE, "bootstrap.mjs"), "/bootstrap.mjs", "--ro-bind", probe, "/probe.mjs",
    "--tmpfs", "/tmp", "--proc", "/proc", "--dev", "/dev", "--chdir", "/",
    "--", "prlimit", `--cpu=${limits.cpuSeconds}`, "--nproc=64", "/node", `--max-old-space-size=${limits.heapMb}`, "/bootstrap.mjs", token,
  ];
  const child = spawn("bwrap", args, { stdio: ["pipe", "pipe", "pipe"], env: {} });
  const calls: SandboxOutcome["calls"] = [];
  const violations: string[] = [];
  let outputBytes = 0, buffer = "", settled = false, result: unknown = null, error: string | null = null;
  let state: SandboxOutcome["state"] = "crashed";

  return await new Promise<SandboxOutcome>((resolve) => {
    const finish = async (final: SandboxOutcome["state"]) => {
      if (settled) return;
      settled = true; state = final;
      clearTimeout(timer);
      child.kill("SIGKILL");
      await rm(dir, { recursive: true, force: true });
      resolve({ sandbox: SANDBOX_VERSION, codeSha256, state, result, error, calls, violations, durationMs: Date.now() - started });
    };
    const timer = setTimeout(() => { violations.push(`wall-clock limit ${limits.wallMs} ms`); void finish("timeout"); }, limits.wallMs);
    child.stderr.on("data", (chunk: Buffer) => { if (!error) error = chunk.toString().slice(0, 300); });
    child.stdout.on("data", async (chunk: Buffer) => {
      if (settled) return; // nothing after settlement is accepted (post-timeout callbacks are dropped)
      outputBytes += chunk.length;
      if (outputBytes > limits.maxOutputBytes) { violations.push(`output over ${limits.maxOutputBytes} bytes`); return void finish("limit"); }
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1);
        if (line.length > limits.maxLineBytes) { violations.push("line too long"); return void finish("limit"); }
        let msg: { type?: string; token?: string; id?: number; op?: string; args?: unknown; result?: unknown; error?: string };
        try { msg = JSON.parse(line); } catch { violations.push("non-JSON output"); continue; }
        if (msg.token !== token) { violations.push("message with wrong token rejected"); continue; }
        if (msg.type === "result") { result = msg.result; return void finish("completed"); }
        if (msg.type === "error") { error = String(msg.error).slice(0, 500); return void finish("error"); }
        if (msg.type !== "call" || typeof msg.op !== "string" || typeof msg.id !== "number") { violations.push("malformed request"); continue; }
        if (calls.length >= limits.maxCalls) { violations.push(`call limit ${limits.maxCalls}`); return void finish("limit"); }
        const reply = handler ? await handler(msg.op, msg.args).catch((e: unknown) => ({ ok: false as const, reason: `handler error: ${String(e).slice(0, 120)}` }))
          : { ok: false as const, reason: "no broker in analysis-only mode" };
        if (settled) return;
        calls.push({ op: msg.op, ok: reply.ok, ...(reply.ok ? {} : { reason: reply.reason }) });
        child.stdin.write(JSON.stringify({ id: msg.id, ...reply }) + "\n");
      }
    });
    child.on("exit", () => { void finish(result !== null ? "completed" : error ? "error" : "crashed"); });
    child.stdin.write(JSON.stringify({ type: "packet", packet }) + "\n");
  });
}
