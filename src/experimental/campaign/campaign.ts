// Experimental autonomous campaign (AUTONOMOUS_CAMPAIGN_BUILD_HANDOFF.md). Versioned configuration, persisted state,
// append-only events and the budget rules. Local state lives in runs/campaign/<id>/ (gitignored): config.json (current
// version), config-history.jsonl, events.jsonl (append-only), state.json (atomic projection/checkpoint), report.md/json.
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { REPO_ROOT } from "../investigation/spend.js";

export const CAMPAIGNS = join(REPO_ROOT, "runs/campaign");
export const CAMPAIGN_ID = /^[a-z0-9][a-z0-9-]{2,39}$/;
export const MAX_CONCURRENCY = 2; // hard cap of this slice, independent of configuration

export const LimitsSchema = z.object({
  claudeInvocations: z.number().int().min(1).max(200), // controller-initiated `claude -p` calls, retries included
  wallMinutes: z.number().positive().max(600), // active controller time, summed across sessions
  concurrency: z.number().int().min(1).max(MAX_CONCURRENCY),
  reportingReserveFraction: z.number().min(0).max(0.5), // share of invocations new investigations may not use
  tokenTarget: z.object({ input: z.number().int().positive(), output: z.number().int().positive() }), // a target, never a hard limit here
});
export type Limits = z.infer<typeof LimitsSchema>;

export const ScopeSchema = z.object({
  description: z.string().min(1).max(600),
  // Local fixtures only. A fixture name must match the broker's fixture rule; no URL is accepted anywhere in scope.
  tasks: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]{1,30}$/),
    userReport: z.string().min(1).max(600),
    keyText: z.string().min(8).max(300),
    pages: z.array(z.string().regex(/^[a-z-]{1,30}$/)).min(1).max(4),
  })).min(1).max(6),
  viewports: z.array(z.enum(["1440x900", "1280x800", "390x844"])).min(1).max(3),
  cachedEvidence: z.array(z.object({ id: z.string().max(40), path: z.string().regex(/^docs\/[A-Za-z0-9/_.-]+$/), summary: z.string().max(600) })).max(6).default([]),
  liveTargets: z.array(z.string()).max(0), // empty by construction: this slice has no public-site authority
});

export const ConfigSchema = z.object({
  schema: z.literal("art/campaign-config/v1"),
  campaignId: z.string().regex(CAMPAIGN_ID),
  configVersion: z.number().int().min(1),
  scopeVersion: z.number().int().min(1),
  model: z.literal("claude-opus-5-5"),
  scope: ScopeSchema,
  limits: LimitsSchema,
});
export type Config = z.infer<typeof ConfigSchema>;

export type { TaskKind, TaskStatus, Task, Usage, Decision, CampaignStatus, State } from "./types.js";
import type { State } from "./types.js";

export const dirOf = (id: string) => { if (!CAMPAIGN_ID.test(id)) throw new Error("invalid campaign id"); return join(CAMPAIGNS, id); };
export const now = () => new Date().toISOString();

export async function writeAtomic(path: string, body: string) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, body);
  await rename(tmp, path);
}

export async function loadConfig(id: string): Promise<Config> { return ConfigSchema.parse(JSON.parse(await readFile(join(dirOf(id), "config.json"), "utf8"))); }
export async function loadState(id: string): Promise<State> { return JSON.parse(await readFile(join(dirOf(id), "state.json"), "utf8")) as State; }

// Single writer: only the process holding controller.lock (or a CLI command when no controller is alive) appends.
// Appends and snapshots go through one promise chain, so concurrent tasks cannot reorder events or race the rename.
export class Store {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(readonly id: string, public state: State) {}
  get dir() { return dirOf(this.id); }
  private serial<T>(fn: () => Promise<T>): Promise<T> { const p = this.chain.then(fn, fn); this.chain = p.catch(() => undefined); return p; }
  event(kind: "op" | "decision", type: string, data: Record<string, unknown> = {}) {
    const seq = ++this.state.lastEventSeq;
    const line = JSON.stringify({ ...data, id: `${this.id}-${seq}`, seq, at: now(), kind, type, configVersion: this.state.configVersion, planRevision: this.state.planRevision }) + "\n";
    return this.serial(() => appendFile(join(this.dir, "events.jsonl"), line));
  }
  save() { return this.serial(async () => { this.state.updatedAt = now(); await writeAtomic(join(this.dir, "state.json"), JSON.stringify(this.state, null, 1)); }); }
}

export async function countEvents(id: string) {
  const text = await readFile(join(dirOf(id), "events.jsonl"), "utf8").catch(() => "");
  const lines = text.split("\n").filter(Boolean);
  return { count: lines.length, lastSeq: lines.length ? (JSON.parse(lines[lines.length - 1]!) as { seq: number }).seq : 0 };
}

export async function createCampaign(config: Config) {
  const dir = dirOf(config.campaignId);
  await mkdir(CAMPAIGNS, { recursive: true });
  await mkdir(dir, { recursive: false }); // fails if the campaign id is already taken
  await writeFile(join(dir, "config.json"), JSON.stringify(config, null, 1), { flag: "wx" });
  await appendFile(join(dir, "config-history.jsonl"), JSON.stringify({ at: now(), reason: "created", config }) + "\n");
  const t = now();
  const state: State = {
    schema: "art/campaign-state/v1", campaignId: config.campaignId, configVersion: config.configVersion, scopeVersion: config.scopeVersion, planRevision: 0,
    status: "running", statusReason: "created", createdAt: t, updatedAt: t, heartbeatAt: null, controller: null, sessions: 0, lastEventSeq: 0,
    usage: { claudeInvocations: 0, claudeInFlight: 0, claudeFailed: 0, wallMs: 0, tokens: { input: 0, cacheCreation: 0, cacheRead: 0, output: 0, thinking: 0 }, tokenCallsWithUsage: 0, tokenCallsWithoutUsage: 0 },
    tasks: [{ id: "scope", kind: "scope", milestone: 1, label: "Validate scope and fixtures", status: "queued", deps: [], attempts: 0 }],
    decisions: [], failures: [], cases: [], evidence: [], nextAction: "start the controller", report: null,
  };
  const store = new Store(config.campaignId, state);
  await store.event("op", "campaign_created", { scopeVersion: config.scopeVersion, limits: config.limits });
  await store.save();
  return store;
}

// Budget rules. Invocations are reserved before a call and stay consumed whether the call succeeds or fails.
export function invocationGate(limits: Limits, usage: State["usage"], purpose: "open" | "finish"): { ok: true } | { ok: false; reason: string } {
  const committed = usage.claudeInvocations + usage.claudeInFlight;
  if (committed + 1 > limits.claudeInvocations) return { ok: false, reason: `Claude invocation ceiling reached (${committed}/${limits.claudeInvocations})` };
  const soft = Math.floor(limits.claudeInvocations * (1 - limits.reportingReserveFraction));
  if (purpose === "open" && committed + 1 > soft) return { ok: false, reason: `soft threshold: ${committed}/${limits.claudeInvocations} invocations committed; the last ${limits.claudeInvocations - soft} are reserved for finishing open work` };
  return { ok: true };
}

// Extension: ceilings may only grow, never below consumption; scope, model, targets and paid authority are untouched.
export function amendLimits(current: Limits, change: Partial<Pick<Limits, "claudeInvocations" | "wallMinutes">>, usage: State["usage"]): Limits {
  const next = { ...current, ...change };
  if (next.claudeInvocations < usage.claudeInvocations + usage.claudeInFlight) throw new Error("cannot lower the invocation ceiling below consumption");
  if (next.wallMinutes * 60_000 < usage.wallMs) throw new Error("cannot lower the wall-time ceiling below consumption");
  if (next.claudeInvocations < current.claudeInvocations || next.wallMinutes < current.wallMinutes) throw new Error("an extension cannot lower a ceiling");
  return LimitsSchema.parse(next);
}
