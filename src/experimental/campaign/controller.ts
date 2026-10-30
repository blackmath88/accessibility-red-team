// Campaign controller: admission, budgets, settlement and checkpoints are software; strategy, triage, probe design and
// conclusions are Claude decisions over compact evidence packets. Investigations reuse the blind-transfer gate
// (transfer.ts import/validate/execute/import-conclusion), so generated probes run only after the same checks.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { MeasurementBroker } from "../investigation/broker.js";
import { runInSandbox, sandboxAvailable } from "../investigation/sandbox.js";
import { REPO_ROOT } from "../investigation/spend.js";
import { type Config, type State, type Task, Store, repairLog, dirOf, invocationGate, loadConfig, loadState, now, writeAtomic, MAX_CONCURRENCY } from "./campaign.js";
import { active, callClaude, extractJson } from "./claude.js";
import { milestones } from "../../../control-center/src/campaignProjection.js";

const run = promisify(execFile);
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const exists = (p: string) => access(p).then(() => true, () => false);
const FIXTURES = join(REPO_ROOT, "test/fixtures/investigation");
const MAX_INVESTIGATIONS = 2;

class BudgetPause extends Error { constructor(msg: string, readonly hard: boolean) { super(msg); } }
class Fence extends Error {}

export const pidAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } };

export async function runController(id: string) {
  const dir = dirOf(id), lockPath = join(dir, "controller.lock");
  // One live controller per campaign. A lock whose pid is gone is claimed; a live one is refused (no double dispatch).
  const prior = await readFile(lockPath, "utf8").then((t) => JSON.parse(t) as { pid: number }, () => null);
  if (prior && pidAlive(prior.pid)) throw new Error(`campaign ${id} already has a live controller (pid ${prior.pid})`);
  // Remove the stale lock only if it is still the same dead one, so a concurrent claimant's fresh lock survives.
  if (prior) { const again = await readFile(lockPath, "utf8").catch(() => ""); if (again && (JSON.parse(again) as { pid: number }).pid === prior.pid) await rm(lockPath); }
  const h = await open(lockPath, "wx"); await h.writeFile(JSON.stringify({ pid: process.pid, at: now() })); await h.close();

  const config = await loadConfig(id);
  const state = await loadState(id);
  const store = new Store(id, state);
  // Checkpoint provenance: the projection must match the append-only log it was built from.
  // A crash can leave the snapshot behind or ahead of the log (or a half-written last line). The log is authoritative:
  // its sequence is adopted, running work is requeued below and every sub-step is idempotent, so nothing is lost.
  const ev = await repairLog(id);
  if (ev.lastSeq !== state.lastEventSeq || ev.dropped) {
    const stateSeq = state.lastEventSeq; state.lastEventSeq = ev.lastSeq;
    await store.event("op", "checkpoint_reconciled", { stateSeq, logSeq: ev.lastSeq, droppedPartialLine: ev.dropped });
  }
  if (config.configVersion !== state.configVersion) { state.configVersion = config.configVersion; }
  if (!sandboxAvailable().ok) { state.status = "stopped"; state.statusReason = "no verified sandbox; nothing executed; resume once it is available"; await store.save(); await rm(lockPath); throw new Error(state.statusReason); }

  state.sessions += 1; state.controller = { pid: process.pid, startedAt: now() }; state.status = "running"; state.statusReason = state.sessions > 1 ? "resumed" : "started";
  for (const t of state.tasks) if (t.status === "running") { t.status = "queued"; await store.event("op", "task_interrupted_requeued", { taskId: t.id, step: t.step ?? null }); }
  for (const t of state.tasks) if (t.status === "paused") { t.status = "queued"; t.error = undefined; await store.event("op", "task_unpaused", { taskId: t.id, step: t.step ?? null }); }
  // Calls in flight when a session died were reserved but never settled: count them as consumed, never as returned.
  if (state.usage.claudeInFlight) { await store.event("op", "inflight_counted_consumed", { calls: state.usage.claudeInFlight }); state.usage.claudeInvocations += state.usage.claudeInFlight; state.usage.claudeInFlight = 0; }
  await store.event("op", state.sessions > 1 ? "controller_resumed" : "controller_started", { pid: process.pid, session: state.sessions, limits: config.limits });
  await store.save();

  let stopRequested = false, budgetStop: string | null = null, fenced: string | null = null;
  let lastBeat = Date.now();
  const beat = setInterval(async () => {
    const t = Date.now(); state.usage.wallMs += t - lastBeat; lastBeat = t; state.heartbeatAt = now();
    if (!budgetStop && state.usage.wallMs >= config.limits.wallMinutes * 60_000) { budgetStop = `wall-time ceiling reached (${Math.round(state.usage.wallMs / 1000)} s of ${config.limits.wallMinutes} min)`; settleWorkers("wall time"); }
    if (!stopRequested && (await exists(join(dir, "stop.request")))) { stopRequested = true; settleWorkers("stop requested"); }
    await store.save().catch(() => undefined);
  }, 2000);
  const settleWorkers = (why: string) => { for (const c of active) c.kill("SIGTERM"); void store.event("op", "workers_settling", { reason: why, active: active.size }); };

  const ctx: Ctx = { config, state, store, dir, budget: () => budgetStop, setBudget: (r) => { budgetStop ??= r; }, stopping: () => stopRequested };
  const running = new Map<string, Promise<void>>();
  try {
    for (;;) {
      if (fenced) break;
      const admissible = !stopRequested && !budgetStop;
      const ready = admissible ? state.tasks.filter((t) => t.status === "queued" && t.deps.every((d) => ["done", "skipped", "failed"].includes(state.tasks.find((x) => x.id === d)?.status ?? ""))) : [];
      while (ready.length && running.size < Math.min(config.limits.concurrency, MAX_CONCURRENCY)) {
        const t = ready.shift()!;
        t.status = "running"; t.startedAt = now(); t.attempts += 1;
        await store.event("op", "task_started", { taskId: t.id, taskKind: t.kind, attempt: t.attempts, step: t.step ?? null });
        state.nextAction = `running ${t.label}`;
        await store.save();
        running.set(t.id, execute(ctx, t).catch((e) => { if (e instanceof Fence) fenced = e.message; }).finally(() => running.delete(t.id)));
      }
      if (!running.size) break;
      await Promise.race(running.values());
    }
    await Promise.all(running.values());
    // Settlement and final status.
    const open = state.tasks.filter((t) => ["queued", "paused", "running"].includes(t.status));
    if (fenced) { state.status = "fenced"; state.statusReason = fenced; }
    else if (stopRequested) { state.status = "stopped"; state.statusReason = "stopped by operator; resumable"; }
    else if (budgetStop || state.tasks.some((t) => t.status === "paused")) { state.status = "budget_exhausted"; state.statusReason = budgetStop ?? state.tasks.find((t) => t.status === "paused")?.error ?? "budget"; }
    else if (open.length) { state.status = "partial"; state.statusReason = "no admissible work left"; }
    else { state.status = state.tasks.some((t) => t.status === "failed") || state.cases.some((c) => c.outcome === "inconclusive") ? "partial" : "completed"; state.statusReason = "all planned work settled"; }
    await writeReport(ctx, state.status !== "completed" && state.status !== "partial" ? true : state.status === "partial");
    if (state.status === "budget_exhausted") await store.event("op", "budget_exhausted", { reason: state.statusReason, usage: state.usage });
    state.nextAction = state.status === "budget_exhausted" ? "extend a ceiling with a reason, then resume" : state.status === "stopped" ? "resume when ready" : state.status === "fenced" ? "correct the enforcement failure; more budget is not a fix" : "review the dossier";
    await store.event("op", "checkpoint_saved", { status: state.status, reason: state.statusReason, open: open.map((t) => t.id) });
  } finally {
    clearInterval(beat);
    state.usage.wallMs += Date.now() - lastBeat; state.controller = null; state.heartbeatAt = now();
    await store.save();
    await rm(lockPath, { force: true });
    await rm(join(dir, "stop.request"), { force: true });
  }
  return state;
}

type Ctx = { config: Config; state: State; store: Store; dir: string; budget: () => string | null; setBudget: (r: string) => void; stopping: () => boolean };

async function settle(ctx: Ctx, t: Task, status: Task["status"], output?: Record<string, unknown>, error?: string) {
  t.status = status; t.settledAt = now(); if (output) t.output = output; t.error = error;
  await ctx.store.event("op", "task_settled", { taskId: t.id, status, error: error ?? null });
  await ctx.store.save();
}
async function decide(ctx: Ctx, taskId: string, kind: string, summary: string, reason: string, extra: Record<string, unknown> = {}) {
  ctx.state.decisions.push({ at: now(), taskId, kind, summary, reason: reason.slice(0, 400) });
  await ctx.store.event("decision", kind, { taskId, summary, reason: reason.slice(0, 400), ...extra });
}
async function evidence(ctx: Ctx, t: Task, kind: string, name: string, body: string) {
  await mkdir(join(ctx.dir, "evidence"), { recursive: true });
  await writeFile(join(ctx.dir, "evidence", name), body);
  const e = { id: name, kind, sha256: sha(body), taskId: t.id };
  ctx.state.evidence.push(e); await ctx.store.event("op", "evidence_recorded", e);
  return name;
}
function enqueue(ctx: Ctx, t: Omit<Task, "status" | "attempts">) {
  if (ctx.state.tasks.some((x) => x.id === t.id)) return; // idempotent: a resumed plan never duplicates work
  ctx.state.tasks.push({ ...t, status: "queued", attempts: 0 });
  void ctx.store.event("op", "task_queued", { taskId: t.id, taskKind: t.kind, deps: t.deps });
}

// A Claude decision: reserved before the call, consumed whatever the outcome, measured usage recorded or marked unknown.
async function claude(ctx: Ctx, t: Task, purpose: "open" | "finish", prompt: string, label: string) {
  if (ctx.budget()) throw new BudgetPause(ctx.budget()!, true);
  if (ctx.stopping()) throw new BudgetPause("stop requested", true);
  const gate = invocationGate(ctx.config.limits, ctx.state.usage, purpose);
  // The soft threshold pauses only this task (finishing work may still use the reserve); the ceiling stops admission.
  if (!gate.ok) throw new BudgetPause(gate.reason, /ceiling reached/.test(gate.reason));
  ctx.state.usage.claudeInFlight += 1;
  await ctx.store.event("op", "claude_reserved", { taskId: t.id, label, purpose, promptSha256: sha(prompt), promptChars: prompt.length });
  const r = await callClaude(ctx.dir, ctx.config.model, prompt);
  ctx.state.usage.claudeInFlight -= 1; ctx.state.usage.claudeInvocations += 1;
  if (r.usage) { const u = ctx.state.usage.tokens; u.input += r.usage.input; u.cacheCreation += r.usage.cacheCreation; u.cacheRead += r.usage.cacheRead; u.output += r.usage.output; u.thinking += r.usage.thinking; ctx.state.usage.tokenCallsWithUsage += 1; }
  else ctx.state.usage.tokenCallsWithoutUsage += 1;
  if (!r.ok) ctx.state.usage.claudeFailed += 1;
  await mkdir(join(ctx.dir, "claude"), { recursive: true });
  const n = ctx.state.usage.claudeInvocations;
  await writeFile(join(ctx.dir, "claude", `${String(n).padStart(3, "0")}-${t.id}-${label}.json`), JSON.stringify({ prompt, ...r }, null, 1));
  await ctx.store.event("op", "claude_settled", { taskId: t.id, label, ok: r.ok, model: r.model, usage: r.usage, durationMs: r.durationMs, error: r.error });
  await ctx.store.save();
  if (!r.ok) throw new Error(`Claude ${label} failed: ${r.error}`);
  return extractJson(r.text) as Record<string, unknown>;
}

async function execute(ctx: Ctx, t: Task) {
  try {
    const out = await ({ scope, strategy, baseline, triage, investigate, replay, report: async () => ({}) } as Record<string, (c: Ctx, t: Task) => Promise<Record<string, unknown>>>)[t.kind]!(ctx, t);
    await settle(ctx, t, "done", out);
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 300);
    if (e instanceof Fence) { await settle(ctx, t, "failed", undefined, msg); throw e; }
    if (e instanceof BudgetPause) { if (e.hard && !ctx.stopping()) ctx.setBudget(msg); await settle(ctx, t, "paused", undefined, msg); return; }
    if (ctx.budget() || ctx.stopping()) { await settle(ctx, t, "paused", undefined, `interrupted: ${ctx.budget() ?? "stop requested"}`); return; }
    // Ordinary failure: one bounded retry, then close this branch; independent work continues.
    const retry = t.attempts < 2 && t.kind !== "investigate";
    ctx.state.failures.push({ at: now(), taskId: t.id, error: msg, recovery: retry ? "retry once" : "branch closed" });
    if (retry) { t.status = "queued"; await ctx.store.event("op", "task_failed_retrying", { taskId: t.id, error: msg }); await ctx.store.save(); }
    else {
      // A closed investigation leaves its case inconclusive, never silently open.
      const caseId = (t.input as { caseId?: string } | undefined)?.caseId;
      if (t.kind === "investigate" && caseId) { setCase(ctx, caseId, "inconclusive", `investigation branch closed: ${msg.slice(0, 200)}`); await decide(ctx, t.id, "investigation_closed", caseId, msg); }
      await settle(ctx, t, "failed", undefined, msg);
    }
  }
}

// ---- tasks ----

async function scope(ctx: Ctx, t: Task) {
  const s = ctx.config.scope, pages: Record<string, string> = {};
  for (const task of s.tasks) for (const p of task.pages) {
    const path = join(FIXTURES, `${p}.html`);
    if (!(await exists(path))) throw new Fence(`scope names fixture ${p}, which does not exist`);
    pages[p] = sha(await readFile(path));
  }
  const cached: Record<string, string> = {};
  for (const c of s.cachedEvidence) cached[c.id] = sha(await readFile(join(REPO_ROOT, c.path)));
  await decide(ctx, t.id, "scope_understood", `${s.tasks.length} user tasks, ${Object.keys(pages).length} local pages, ${s.viewports.length} viewports, ${s.cachedEvidence.length} cached evidence items; no live targets`, "scope is validated configuration; nothing outside it is admitted");
  enqueue(ctx, { id: "strategy", kind: "strategy", milestone: 2, label: "Claude: choose sample and order", deps: ["scope"] });
  return { pages, cached };
}

async function strategy(ctx: Ctx, t: Task) {
  const s = ctx.config.scope, L = ctx.config.limits;
  const packet = {
    scope: s.tasks.map((x) => ({ task: x.id, userReport: x.userReport, keyText: x.keyText, pages: x.pages })), viewports: s.viewports,
    cachedEvidence: s.cachedEvidence.map((c) => ({ id: c.id, summary: c.summary })),
    baselineMeasures: "for one page/viewport/key text: whether the text is found, ink inside its rect vs a nearby background clip, whether it is topmost/covered/absent at up to 16 hit-test points, and a screenshot. No model is involved; it costs no Claude invocation.",
    budget: { claudeInvocationsLeft: L.claudeInvocations - ctx.state.usage.claudeInvocations, investigationCostInvocations: "2-3 each (design, optional revision, conclusion)", maxInvestigations: MAX_INVESTIGATIONS },
  };
  const prompt = `You are the strategist of a bounded local accessibility campaign. Decide which page/viewport units to measure with the algorithmic baseline, and in which order. You cannot add pages, viewports or targets; anything outside the packet is rejected. Prefer high-value uncertainties; use cached evidence to avoid redundant work, but say why. Reply with ONE JSON object: {"summary":"<one sentence>","units":[{"task","page","viewport","action":"measure"|"skip","priority":1-9,"reason"}],"reason":"<why this sample>"}\n\nPACKET:\n${JSON.stringify(packet)}`;
  const r = await claude(ctx, t, "open", prompt, "strategy") as { summary?: string; reason?: string; units?: Array<{ task: string; page: string; viewport: string; action: string; priority?: number; reason?: string }> };
  const valid = (u: { task: string; page: string; viewport: string }) => s.tasks.some((x) => x.id === u.task && x.pages.includes(u.page)) && (s.viewports as string[]).includes(u.viewport);
  const units = (r.units ?? []).filter((u) => valid(u));
  const rejected = (r.units ?? []).length - units.length;
  ctx.state.planRevision += 1;
  const measure = units.filter((u) => u.action === "measure").sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9));
  for (const u of measure) enqueue(ctx, { id: `baseline-${u.task}-${u.page}-${u.viewport}`, kind: "baseline", milestone: 3, label: `Baseline ${u.page} @ ${u.viewport}`, deps: ["strategy"], input: { task: u.task, page: u.page, viewport: u.viewport } });
  enqueue(ctx, { id: "triage", kind: "triage", milestone: 4, label: "Claude: investigate or reject signals", deps: measure.map((u) => `baseline-${u.task}-${u.page}-${u.viewport}`) });
  await decide(ctx, t.id, "strategy_set", `${r.summary ?? ""} (${measure.length} measured, ${units.length - measure.length} skipped${rejected ? `, ${rejected} out-of-scope units refused` : ""})`, r.reason ?? "", { planRevision: ctx.state.planRevision, units });
  return { units, refusedOutOfScope: rejected };
}

const BASELINE_CODE = () => readFile(join(REPO_ROOT, "src/experimental/campaign/baseline-probe.mjs"), "utf8");
async function measure(ctx: Ctx, label: string, page: string, viewport: string, keyText: string) {
  const broker = new MeasurementBroker({ runDir: ctx.dir, ledgerPath: join(ctx.dir, "no-live-ledger.json"), fixtureDir: FIXTURES, liveAllowed: false, maxLiveLoads: 0, minGapMs: 10_000, resourcePolicy: "same-origin" });
  try {
    const out = await runInSandbox(await BASELINE_CODE(), { target: page, viewport, affectedText: keyText }, broker.forAttempt(label));
    if (out.state !== "completed") throw new Error(`baseline ${out.state}: ${out.error ?? ""}`);
    return out.result as Baseline;
  } finally { await broker.close(); }
}
type Baseline = { found: number; hitTest?: { points: number; topmost: number; covered: number; missing: number; coverers: Record<string, number> }; textPixels?: { min: number; p05: number; p50: number; max: number }; referencePixels?: { p50: number }; screenshot?: { id: string; sha256: string }; element?: { rect: unknown } };
export function signals(b: Baseline) {
  const s: string[] = [];
  if (!b.found) return ["text not found"];
  const h = b.hitTest!, px = b.textPixels!, ref = b.referencePixels!;
  if (px.max - px.min < 25 || ref.p50 - px.p05 < 30) s.push("no ink: text-rect pixels are flat or match the background");
  if (h.points && h.covered / h.points > 0.3) s.push(`covered at ${h.covered}/${h.points} points by ${Object.keys(h.coverers).join(", ")}`);
  if (h.points && h.missing / h.points > 0.2) s.push(`text absent from hit testing at ${h.missing}/${h.points} points inside its own rect`);
  return s;
}

async function baseline(ctx: Ctx, t: Task) {
  const { task, page, viewport } = t.input as { task: string; page: string; viewport: string };
  const keyText = ctx.config.scope.tasks.find((x) => x.id === task)!.keyText;
  const b = await measure(ctx, t.id, page, viewport, keyText);
  const ev = await evidence(ctx, t, "baseline", `${t.id}.json`, JSON.stringify(b, null, 1));
  if (b.screenshot) ctx.state.evidence.push({ id: b.screenshot.id, kind: "screenshot", sha256: b.screenshot.sha256, taskId: t.id });
  return { signals: signals(b), evidence: ev, screenshot: b.screenshot?.id ?? null, hitTest: b.hitTest ?? null, textPixels: b.textPixels ?? null };
}

async function triage(ctx: Ctx, t: Task) {
  const done = ctx.state.tasks.filter((x) => x.kind === "baseline" && x.status === "done");
  if (!done.length) throw new Error("no baseline evidence to triage");
  const units = done.map((x) => ({ unit: x.id, ...(x.input as object), signals: (x.output as { signals: string[] }).signals, hitTest: x.output!["hitTest"], textPixels: x.output!["textPixels"] }));
  const failedUnits = ctx.state.tasks.filter((x) => x.kind === "baseline" && x.status === "failed").map((x) => x.id);
  const prompt = `You triage algorithmic baseline evidence in a bounded local accessibility campaign. For each unit with a signal, decide whether to open a bounded investigation (at most ${MAX_INVESTIGATIONS} in total; each needs a control page from the same task) or to reject/defer it with a concrete reason. Cached evidence from earlier investigations may justify not reinvestigating. Never invent units. Reply with ONE JSON object: {"decisions":[{"unit":"<unit id>","action":"investigate"|"reject","control":"<page name of the other page in the same task, e.g. ${ctx.config.scope.tasks[0]!.pages.at(-1)}>","question","alternatives":["..."],"reason"}],"summary"}\n\nUSER TASKS: ${JSON.stringify(ctx.config.scope.tasks.map((x) => ({ task: x.id, userReport: x.userReport, pages: x.pages })))}\nCACHED EVIDENCE: ${JSON.stringify(ctx.config.scope.cachedEvidence.map((c) => ({ id: c.id, summary: c.summary })))}\nBASELINE UNITS: ${JSON.stringify(units)}\nFAILED UNITS (no evidence): ${JSON.stringify(failedUnits)}`;
  const r = await claude(ctx, t, "open", prompt, "triage") as { summary?: string; decisions?: Array<{ unit: string; action: string; control?: string; question?: string; alternatives?: string[]; reason?: string }> };
  let opened = 0;
  for (const d of r.decisions ?? []) {
    const u = done.find((x) => x.id === d.unit); if (!u) continue;
    const inp = u.input as { task: string; page: string; viewport: string };
    const task = ctx.config.scope.tasks.find((x) => x.id === inp.task)!;
    const control = resolveControl(d.control, task.pages, inp.page);
    const caseId = `case-${inp.task}-${inp.page}-${inp.viewport}`;
    if (ctx.state.cases.some((c) => c.id === caseId)) continue; // a re-run triage never duplicates a case
    if (d.action === "investigate" && control && opened < MAX_INVESTIGATIONS) {
      opened++;
      const id = `inv-${opened}`;
      enqueue(ctx, { id, kind: "investigate", milestone: 4, label: `Investigate ${inp.page} @ ${inp.viewport} vs ${control}`, deps: ["triage"], input: { ...inp, control, question: d.question ?? "", alternatives: d.alternatives ?? [], baseline: u.id, caseId } });
      enqueue(ctx, { id: `replay-${opened}`, kind: "replay", milestone: 5, label: `Replay ${inp.page} and ${control} @ ${inp.viewport}`, deps: [id], input: { ...inp, control, baseline: u.id, caseId, investigation: id } });
      ctx.state.cases.push({ id: caseId, task: inp.task, page: inp.page, viewport: inp.viewport, outcome: "open", summary: d.question ?? "", evidence: [u.id] });
      await decide(ctx, t.id, "investigation_opened", `${inp.page} @ ${inp.viewport} vs ${control}: ${d.question ?? ""}`, d.reason ?? "", { unit: d.unit, alternatives: d.alternatives ?? [] });
    } else {
      // A requested investigation the controller could not open is reported as such, never as a rejection.
      const notOpened = d.action === "investigate";
      const why = notOpened ? `${d.reason ?? ""} [not opened: ${control ? "investigation cap" : "no valid control page"}]` : d.reason ?? "";
      if ((u.output as { signals: string[] }).signals.length) ctx.state.cases.push({ id: caseId, task: inp.task, page: inp.page, viewport: inp.viewport, outcome: notOpened ? "inconclusive" : "rejected", summary: why.slice(0, 300), evidence: [u.id] });
      await decide(ctx, t.id, notOpened ? "investigation_not_opened" : "signal_rejected", `${d.unit}`, why, { unit: d.unit, control: d.control ?? null });
    }
  }
  enqueue(ctx, { id: "report", kind: "report", milestone: 6, label: "Deliver dossier", deps: ctx.state.tasks.filter((x) => x.kind === "investigate" || x.kind === "replay").map((x) => x.id) });
  await decide(ctx, t.id, "triage_done", r.summary ?? `${opened} investigations opened`, `${(r.decisions ?? []).length} decisions over ${units.length} units`);
  return { opened, decisions: r.decisions ?? [] };
}

// ---- investigation through the transfer gate ----

async function transferCli(env: Record<string, string>, args: string[]) {
  const p = run("npx", ["tsx", "src/experimental/investigation/transfer.ts", ...args], { cwd: REPO_ROOT, env: { ...process.env, ...env }, maxBuffer: 20 * 1024 * 1024, timeout: 600_000 }).catch((e: { stdout?: string; stderr?: string; message: string }) => { throw new Error(`transfer ${args[1]} failed: ${(e.stderr || e.message).slice(0, 300)}`); });
  // Settled with the Claude children on stop or wall-time exhaustion.
  const child = (p as unknown as { child?: import("node:child_process").ChildProcess }).child;
  if (child) { active.add(child); child.on("close", () => active.delete(child)); }
  return (await p).stdout;
}

async function investigate(ctx: Ctx, t: Task) {
  const inp = t.input as { task: string; page: string; viewport: string; control: string; question: string; alternatives: string[]; baseline: string; caseId: string };
  const task = ctx.config.scope.tasks.find((x) => x.id === inp.task)!;
  const runName = `${ctx.config.campaignId}-${t.id}`, runDir = join(REPO_ROOT, "runs/ail-transfer", runName);
  const symptomPath = join(ctx.dir, `symptom-${t.id}.json`);
  if (!(await exists(symptomPath))) await writeFile(symptomPath, JSON.stringify({ symptom: task.userReport, affectedText: task.keyText, pages: [inp.page, inp.control], viewports: [inp.viewport] }));
  const env = { AIL_TRANSFER_TARGETS: `${inp.page},${inp.control}`, AIL_TRANSFER_SYMPTOM: symptomPath, AIL_EXTERNAL_MODEL: ctx.config.model };
  const base = ctx.state.tasks.find((x) => x.id === inp.baseline)!.output;
  const step = async (s: string) => { t.step = s; await ctx.store.event("op", "investigation_step", { taskId: t.id, step: s }); await ctx.store.save(); };
  const saved = (name: string) => join(ctx.dir, `${name}-${t.id}.json`);
  // Every sub-step is idempotent: a saved Claude reply is reused instead of paying for the call again, and a side
  // effect already present in the transfer run (proposal, results, frozen conclusion) is not repeated after a crash.
  const once = async (name: string, purpose: "open" | "finish", prompt: () => Promise<string>) => {
    if (await exists(saved(name))) return JSON.parse(await readFile(saved(name), "utf8")) as Record<string, unknown>;
    const r = await claude(ctx, t, purpose, await prompt(), name);
    await writeFile(saved(name), JSON.stringify(r));
    return r;
  };
  const importProposal = async (a: string, from?: string) => {
    if (!(await exists(join(runDir, "attempts", a, "proposal.json")))) await transferCli(env, [runName, "import", a, saved(`proposal-${a}`), ...(from ? [from] : [])]);
  };
  let attempt = (t.output?.["attempt"] as string | undefined) ?? "d1";
  const evidencePacket = `CAMPAIGN EVIDENCE THAT TRIGGERED THIS INVESTIGATION (algorithmic baseline on ${inp.page} @ ${inp.viewport}): ${JSON.stringify(base)}\nQUESTION: ${inp.question}\nALTERNATIVES TO SEPARATE: ${JSON.stringify(inp.alternatives)}\nCONTROL PAGE: ${inp.control}`;

  if (!t.step) {
    await once("proposal-d1", "open", async () => `${await transferCli(env, [runName, "brief", "initial"])}\n\n${evidencePacket}\n\nReply with ONE JSON object only.`);
    await importProposal("d1");
    await step("designed");
  }
  if (t.step === "designed" || t.step === "revised") {
    const v = JSON.parse(await transferCli(env, [runName, "validate", attempt])) as { passed: boolean; failures: string[] };
    await ctx.store.event("op", "gate_result", { taskId: t.id, attempt, passed: v.passed, failures: v.failures });
    if (!v.passed && attempt === "d1") {
      await once("proposal-d2", "open", async () => `${await transferCli(env, [runName, "brief", "initial"])}\n\n${evidencePacket}\n\nYOUR PREVIOUS PROPOSAL FAILED THE PRE-EXECUTION GATE: ${JSON.stringify(v.failures)}\nPrevious code:\n${await readFile(join(runDir, "attempts/d1/probe.mjs"), "utf8")}\nSubmit one revised proposal (this is the only revision). Reply with ONE JSON object only.`);
      await importProposal("d2", "d1");
      attempt = "d2"; t.output = { attempt }; await step("revised");
      return investigate(ctx, t);
    }
    if (!v.passed) { setCase(ctx, inp.caseId, "inconclusive", `probe failed the gate after one revision: ${v.failures.join("; ")}`); await decide(ctx, t.id, "investigation_inconclusive", inp.caseId, "gate failed after one revision; branch closed"); return { attempt, gate: v }; }
    t.output = { attempt }; await step("validated");
  }
  if (t.step === "validated") {
    if (!(await exists(join(runDir, "attempts", attempt, "results.json")))) await transferCli(env, [runName, "execute", attempt]);
    t.output = { attempt }; await step("executed");
  }
  if (t.step === "executed") {
    const results = await readFile(join(runDir, "attempts", attempt, "results.json"), "utf8");
    const compact = Object.entries(JSON.parse(results) as Record<string, { state?: string; error?: string; result?: unknown }>).map(([k, v]) => `${k}: ${JSON.stringify({ state: v.state, error: v.error, result: v.result }).slice(0, 12_000)}`).join("\n");
    const proposal = await readFile(join(runDir, "attempts", attempt, "proposal.json"), "utf8");
    const conclusion = await once("conclusion", "finish", async () => `You concluded a bounded accessibility investigation. From the recorded measurements only, state which page shows the reported problem and why. Cite measurements ("page@viewport: field = value") for every causal claim; report contradicting evidence; separate observation, explanation and uncertainty (including what the broker cannot observe). Say "undetermined" if the evidence does not establish it.\nSYMPTOM: ${JSON.stringify({ report: task.userReport, text: task.keyText })}\n${evidencePacket}\nPROPOSAL:\n${proposal}\nMEASUREMENTS (each page/viewport capped at 12,000 characters):\n${compact}\nReply with ONE JSON object: {"defectivePage":"${inp.page}"|"${inp.control}"|"undetermined","explanation":"<at most 1,500 characters>","supportingMeasurements":[at most 10 items],"unsupportedOrUntested":[at most 10 items],"contradictions":[...],"confidence":"low"|"medium"|"high"}`);
    let c = conclusion;
    if (!(await exists(join(runDir, "conclusion.json")))) {
      try { await transferCli(env, [runName, "import-conclusion", attempt, saved("conclusion")]); }
      catch (e) {
        // Bounded recovery: one corrective call with the schema rejection; the rejected reply stays in claude/.
        const err = String((e as Error).message).slice(0, 600);
        await ctx.store.event("op", "conclusion_rejected_by_schema", { taskId: t.id, error: err.slice(0, 300) });
        c = await once("conclusion-fix", "finish", async () => `Your conclusion was rejected by the storage schema: ${err}\nShorten it to fit (explanation at most 1,500 characters, at most 10 items per list) without changing its content or verdict. Reply with ONE JSON object only.\nYOUR CONCLUSION:\n${JSON.stringify(conclusion)}`);
        await transferCli(env, [runName, "import-conclusion", attempt, saved("conclusion-fix")]);
      }
    }
    const body = await readFile(join(runDir, "conclusion.json"), "utf8");
    c = JSON.parse(body) as Record<string, unknown>; // the frozen conclusion is authoritative
    const ev = await evidence(ctx, t, "conclusion", `${t.id}-conclusion.json`, body);
    const page = String(c["defectivePage"]);
    const outcome = page === inp.page ? "supported" : page === "undetermined" ? "inconclusive" : "rejected";
    setCase(ctx, inp.caseId, outcome, String(c["explanation"] ?? "").slice(0, 500), ev);
    await decide(ctx, t.id, "investigation_concluded", `${inp.caseId}: ${outcome} (${String(c["confidence"])} confidence)`, String(c["explanation"] ?? "").slice(0, 400));
    t.output = { attempt, outcome, conclusion: ev }; await step("concluded");
  }
  return t.output ?? {};
}
// The control may be given as a page name or as a baseline unit id; with exactly two pages the other one is implied.
export function resolveControl(given: string | undefined, pages: string[], page: string): string | null {
  const others = pages.filter((p) => p !== page);
  if (given) { const hit = others.find((p) => given === p || given.includes(`-${p}-`)); if (hit) return hit; }
  return others.length === 1 ? others[0]! : null;
}
function setCase(ctx: Ctx, id: string, outcome: State["cases"][number]["outcome"], summary: string, ev?: string) {
  const c = ctx.state.cases.find((x) => x.id === id); if (!c) return;
  c.outcome = outcome; c.summary = summary; if (ev) c.evidence.push(ev);
}

async function replay(ctx: Ctx, t: Task) {
  const inp = t.input as { task: string; page: string; viewport: string; control: string; baseline: string; caseId: string };
  const keyText = ctx.config.scope.tasks.find((x) => x.id === inp.task)!.keyText;
  const fresh = await measure(ctx, `${t.id}-page`, inp.page, inp.viewport, keyText);
  const control = await measure(ctx, `${t.id}-control`, inp.control, inp.viewport, keyText);
  const before = (ctx.state.tasks.find((x) => x.id === inp.baseline)!.output as { signals: string[] }).signals;
  const now = signals(fresh), ctl = signals(control);
  const reproduced = JSON.stringify(now) === JSON.stringify(before);
  const ev = await evidence(ctx, t, "replay", `${t.id}.json`, JSON.stringify({ fresh, control, before, now, control_signals: ctl, reproduced }, null, 1));
  const c = ctx.state.cases.find((x) => x.id === inp.caseId); if (c) c.evidence.push(ev);
  await decide(ctx, t.id, "replay_compared", `${inp.page} @ ${inp.viewport}: signals ${reproduced ? "reproduced" : "changed"}; control ${inp.control}: ${ctl.length ? ctl.join("; ") : "no signal"}`, "fresh broker session, same fixed baseline probe");
  return { reproduced, signals: now, controlSignals: ctl, evidence: ev };
}

// Deterministic dossier from stored facts; written on completion and on every budget/stop checkpoint (partial).
async function writeReport(ctx: Ctx, partial: boolean) {
  const s = ctx.state, L = ctx.config.limits, u = s.usage;
  const lines = [
    `# Campaign ${s.campaignId}${partial ? " — PARTIAL" : ""}`, "",
    `Status: ${s.status} (${s.statusReason}). Config v${s.configVersion}, scope v${s.scopeVersion}, plan revision ${s.planRevision}, sessions ${s.sessions}.`,
    `Local fixtures only; rehearsal on known pages, not a blind result.`, "",
    "## Milestones", ...milestones(s).map((m) => `- ${m.n}. ${m.title}: ${m.state} — ${m.note}${m.failed ? `, ${m.failed} failed` : ""}${m.paused ? `, ${m.paused} paused` : ""}`), "",
    "## Cases", ...(s.cases.length ? s.cases.map((c) => `- ${c.id} (${c.task}): **${c.outcome}** — ${c.summary} [evidence: ${c.evidence.join(", ")}]`) : ["- none"]), "",
    "## Decisions", ...s.decisions.map((d) => `- ${d.at} ${d.kind}: ${d.summary} — ${d.reason}`), "",
    "## Failures", ...(s.failures.length ? s.failures.map((f) => `- ${f.taskId}: ${f.error} (${f.recovery})`) : ["- none"]), "",
    "## Resources",
    `- Claude invocations: ${u.claudeInvocations}/${L.claudeInvocations} (failed ${u.claudeFailed}); wall ${Math.round(u.wallMs / 1000)} s of ${L.wallMinutes} min; concurrency ${L.concurrency}.`,
    `- Measured tokens (${u.tokenCallsWithUsage} calls with usage, ${u.tokenCallsWithoutUsage} without): input ${u.tokens.input}, cache creation ${u.tokens.cacheCreation}, cache read ${u.tokens.cacheRead}, output ${u.tokens.output} (thinking ${u.tokens.thinking}). Target ${L.tokenTarget.input}/${L.tokenTarget.output} is a target, not an enforced ceiling.`, "",
    "## Open work", ...(s.tasks.filter((t) => !["done", "skipped", "failed"].includes(t.status)).map((t) => `- ${t.id}: ${t.status}${t.error ? ` (${t.error})` : ""}`)), "",
    "## Limitations", "- Output tokens per call cannot be capped with the installed CLI; invocations, wall time and concurrency are the enforced limits.", "- Screenshots are recorded as evidence; no model inspected them.",
  ];
  await writeAtomic(join(ctx.dir, "report.md"), lines.join("\n") + "\n");
  s.report = { path: "report.md", partial, at: now() };
  await ctx.store.event("op", "report_written", { partial, sha256: sha(lines.join("\n") + "\n") });
  const rep = s.tasks.find((t) => t.kind === "report");
  if (rep && rep.status === "done" && partial) rep.output = { partial };
}
