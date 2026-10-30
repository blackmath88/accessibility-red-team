// One controller-initiated Claude decision: the installed Claude Code CLI in print mode, with no tools, no MCP servers and
// no session persistence, run from an empty directory under the campaign folder (subscription routing; no API key).
// Flags used exist in `claude --help` of the installed CLI. There is no per-call output-token flag, so output size is
// measured afterwards, never enforced. Usage is taken from the CLI's JSON result when present; otherwise it is null.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Usage } from "./campaign.js";

export type ClaudeResult = { ok: boolean; text: string; usage: Usage | null; model: string | null; durationMs: number; error: string | null };
export const active = new Set<ChildProcess>(); // settled on stop / budget exhaustion

export async function callClaude(campaignDir: string, model: string, prompt: string, timeoutMs = 300_000): Promise<ClaudeResult> {
  const cwd = join(campaignDir, "claude-cwd");
  await mkdir(cwd, { recursive: true });
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn("claude", ["-p", "--model", model, "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    active.add(child);
    let out = "", err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code, signal) => {
      clearTimeout(timer); active.delete(child);
      const durationMs = Date.now() - started;
      try {
        const r = JSON.parse(out) as { result?: string; is_error?: boolean; usage?: Record<string, unknown>; modelUsage?: Record<string, unknown> };
        const u = r.usage as Record<string, number | Record<string, number>> | undefined;
        const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
        const usage = u && n(u["input_tokens"]) !== null && n(u["output_tokens"]) !== null
          ? { input: n(u["input_tokens"])!, cacheCreation: n(u["cache_creation_input_tokens"]) ?? 0, cacheRead: n(u["cache_read_input_tokens"]) ?? 0, output: n(u["output_tokens"])!, thinking: n((u["output_tokens_details"] as Record<string, number> | undefined)?.["thinking_tokens"]) ?? 0 }
          : null;
        const models = Object.keys(r.modelUsage ?? {});
        resolve({ ok: !r.is_error && typeof r.result === "string", text: r.result ?? "", usage, model: models.join(",") || null, durationMs, error: r.is_error ? "CLI reported an error" : null });
      } catch {
        // Sanitised: exit status only, no stderr content (it can carry environment details).
        resolve({ ok: false, text: "", usage: null, model: null, durationMs, error: signal ? `terminated by ${signal}` : `exit ${code}, unparseable output (${err.length} bytes stderr)` });
      }
    });
    child.stdin.end(prompt);
  });
}

export function extractJson(text: string): unknown {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(a, b + 1));
}
