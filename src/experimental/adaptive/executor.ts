// Bounded executor for the adaptive harness. The model proposes one action per turn; this module validates it against the
// current observation, runs it as ordinary Playwright code (no eval of model text, no generated code), records evidence and
// enforces hard budgets. No silent retries, no escalation, no fallback provider.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, Page } from "playwright";
import {
  ActionSchema, ACTION_TYPES, CandidateFindingSchema, ModelDecisionSchema, SessionConfigSchema, SessionResultSchema,
  type Action, type DenialReason, type ElementFacts, type EvidenceRecord, type Observation, type PinnedVersions,
  type PolicyDenial, type SessionConfig, type SessionConfigInput, type SessionResult, type StoredCandidate, type TerminalStatus, type TraceStep,
} from "./contracts.js";
import { ELEMENT_SELECTOR, observePage, type LastActivated } from "./observe.js";
import { BrowserGuard, CONTEXT_OPTIONS, SessionPolicy, classifyActivation, launchSandboxBrowser, type RecordDenial, type Resolver } from "./policy.js";
import { ProviderError, type ModelProvider } from "./provider.js";
import { OBSERVATION_MARKER } from "./providers/fake.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SKILL_PATH = join(HERE, "skill", "adaptive-a11y-skill.v1.md");
export const SKILL_VERSION = "adaptive-a11y-skill/v1";
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const MAX_DENIALS = 10;
const MAX_CONSECUTIVE_UNKNOWN = 2;

export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const estimateTokens = (text: string) => Math.ceil(text.length / 4);
const firstLine = (error: unknown) => (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 300);

export function codeSha(): string {
  const git = (args: string[]) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    return git(["status", "--porcelain", "--", "src", "package.json"]) ? `${git(["rev-parse", "HEAD"])}+dirty` : git(["rev-parse", "HEAD"]);
  } catch {
    return "unknown";
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}

// The hash excludes the session id so that two arms with the same effective configuration pin the same value.
export function configHash(config: SessionConfig): string {
  const { sessionId: _sessionId, ...rest } = config;
  return sha256(JSON.stringify(canonical(rest)));
}

export type RunSessionOptions = {
  config: SessionConfigInput;
  provider: ModelProvider;
  outDir: string;
  signal?: AbortSignal;
  // Optional shared browser (never closed here). Every session still gets a fresh disposable context.
  browser?: Browser;
  resolver?: Resolver;
  codeSha?: string;
};

type Cause = "cancelled" | "timeout";
type Checked = { ok: true; action: Action } | { ok: false; reason: DenialReason; detail: string; url?: string };
type Decision = { ok: true; raw: unknown } | { ok: false; reason: string };

function parseDecision(text: string): Decision {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { ok: false, reason: "model output is not valid JSON" }; }
  const decision = ModelDecisionSchema.safeParse(json);
  if (!decision.success || decision.data.action === undefined) return { ok: false, reason: "model output does not match {action, rationale?}" };
  return { ok: true, raw: decision.data.action };
}

export function stateKey(observation: Observation, normalize: (url: string) => string): string {
  const expanded = observation.controls.filter((control) => control.expanded === "true").map((control) => control.name || control.ref).sort();
  const dialogs = observation.dialogs.filter((dialog) => dialog.visible).length;
  return `${normalize(observation.url)} | expanded=[${expanded.join(",")}] | dialogs=${dialogs}`;
}

class Session {
  readonly policy: SessionPolicy;
  readonly evidence: EvidenceRecord[] = [];
  readonly denials: PolicyDenial[] = [];
  readonly candidates: StoredCandidate[] = [];
  readonly trace: TraceStep[] = [];
  readonly surfaces = new Set<string>();
  readonly states = new Set<string>();
  readonly discovered = new Set<string>();
  readonly usage = { inputTokens: 0, outputTokens: 0, estimated: false };
  modelCalls = 0;
  status: TerminalStatus = "completed";
  reason = "";
  finishSummary: string | null = null;
  cause: Cause | null = null;

  private readonly ac = new AbortController();
  private page!: Page;
  private context: BrowserContext | null = null;
  private step = 0;
  private lastActivated: LastActivated | null = null;
  private elements = new Map<string, ElementFacts>();
  private observation!: Observation;
  private consecutiveUnknown = 0;
  private readonly startedAtMs = Date.now();

  constructor(readonly config: SessionConfig, private readonly options: RunSessionOptions, private readonly skillText: string) {
    this.policy = new SessionPolicy(config, options.resolver);
  }

  private get limits() { return this.config.limits; }
  private get outDir() { return this.options.outDir; }

  abort(why: Cause): void {
    if (!this.cause) this.cause = why;
    this.ac.abort();
  }

  readonly deny = (input: Parameters<RecordDenial>[0]): PolicyDenial => {
    const denial: PolicyDenial = {
      id: `den_${this.denials.length + 1}`, step: this.step, timestamp: new Date().toISOString(), source: input.source, reason: input.reason,
      detail: input.detail.slice(0, 400), url: input.url, attemptedAction: input.attemptedAction ?? null,
    };
    this.denials.push(denial);
    return denial;
  };

  async flush(): Promise<void> {
    await writeFile(join(this.outDir, "evidence.json"), JSON.stringify(this.evidence, null, 2));
    await writeFile(join(this.outDir, "denials.json"), JSON.stringify(this.denials, null, 2));
    await writeFile(join(this.outDir, "candidates.json"), JSON.stringify(this.candidates, null, 2));
  }

  async run(browser: Browser): Promise<void> {
    this.context = await browser.newContext(CONTEXT_OPTIONS);
    this.ac.signal.addEventListener("abort", () => { void this.context?.close().catch(() => undefined); }, { once: true });
    const guard = new BrowserGuard(this.context, this.policy, (input) => { this.deny(input); });
    await guard.install();
    this.page = await guard.openPage();

    const start = await this.policy.checkNavigationTarget(this.config.startUrl);
    if (!start.allow) throw new Error(`start URL rejected: ${start.detail}`);
    await this.page.goto(this.config.startUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await this.page.waitForTimeout(150);
    this.surfaces.add(this.policy.normalize(this.page.url()));

    while (await this.turn()) this.step += 1;
  }

  async closeContext(): Promise<void> {
    await this.context?.close().catch(() => undefined);
  }

  private end(status: TerminalStatus, reason: string): false {
    this.status = status; this.reason = reason;
    return false;
  }

  private async log(record: TraceStep): Promise<void> {
    this.trace.push(record);
    await appendFile(join(this.outDir, "trace.jsonl"), JSON.stringify(record) + "\n");
  }

  // One observe → decide → validate → execute round. Returns false when the session is over.
  private async turn(): Promise<boolean> {
    const { limits } = this;
    if (this.ac.signal.aborted) return false;
    if (this.step >= limits.maxSteps) return this.end("budget_exhausted", `maxSteps ${limits.maxSteps} reached`);
    if (this.modelCalls >= limits.maxModelCalls) return this.end("budget_exhausted", `maxModelCalls ${limits.maxModelCalls} reached`);
    if (this.policy.bytesExceeded) return this.end("budget_exhausted", `maxResponseBytes ${limits.maxResponseBytes} exceeded`);
    // Only model-caused refusals count: automatic page behaviour (beacons, auto-submit, popups) is recorded but cannot end the session.
    if (this.denials.filter((denial) => denial.source === "executor_validation").length >= MAX_DENIALS) return this.end("denial_limit", `${MAX_DENIALS} refused model actions`);

    const startedAt = new Date().toISOString();
    const observed = await observePage({
      page: this.page, policy: this.policy, step: this.step, lastActivated: this.lastActivated,
      evidence: this.evidence.map((item) => ({ id: item.id, step: item.step, kind: item.kind })),
      denials: this.denials.map((denial) => ({ id: denial.id, reason: denial.reason, detail: denial.detail })),
      budget: {
        stepsLeft: limits.maxSteps - this.step, modelCallsLeft: limits.maxModelCalls - this.modelCalls,
        wallMsLeft: Math.max(0, limits.maxWallMs - (Date.now() - this.startedAtMs)), surfacesLeft: limits.maxSurfaces - this.surfaces.size,
      },
      discovered: this.discovered, visitedSurfaces: this.surfaces,
    });
    this.observation = observed.observation;
    this.elements = observed.elements;
    for (const url of observed.discoveredNow) this.discovered.add(url);
    this.states.add(stateKey(this.observation, (url) => this.policy.normalize(url)));
    const observationJson = JSON.stringify(this.observation);
    await appendFile(join(this.outDir, "observations.jsonl"), observationJson + "\n");

    const messages = [
      { role: "system" as const, content: `${this.skillText}\n\nReply with exactly one JSON object: {"action": {...}, "rationale": "..."}.` },
      { role: "user" as const, content: `${OBSERVATION_MARKER}\n${observationJson}` },
    ];
    const inputEstimate = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
    if (this.usage.inputTokens + inputEstimate > limits.maxInputTokens) return this.end("budget_exhausted", `maxInputTokens ${limits.maxInputTokens} would be exceeded`);
    const outputLeft = limits.maxOutputTokens - this.usage.outputTokens;
    if (outputLeft < 1) return this.end("budget_exhausted", `maxOutputTokens ${limits.maxOutputTokens} reached`);

    const record: TraceStep = {
      step: this.step, startedAt, observationUrl: this.observation.url, observationSha256: sha256(observationJson), modelCall: null,
      action: null, outcome: "no_model_call", detail: "", evidenceIds: [], denialIds: [],
    };
    const denialsBefore = this.denials.length;
    const evidenceBefore = this.evidence.length;

    this.modelCalls += 1;
    let response;
    try {
      response = await this.options.provider.complete({
        messages, maxOutputTokens: Math.min(600, outputLeft), temperature: 0, responseFormat: "json_object",
        timeoutMs: Math.max(100, Math.min(30_000, limits.maxWallMs - (Date.now() - this.startedAtMs))), signal: this.ac.signal,
      });
    } catch (error) {
      const kind = error instanceof ProviderError ? error.kind : "error";
      if (this.ac.signal.aborted || kind === "cancelled") { if (!this.cause) this.cause = "cancelled"; return false; }
      record.detail = `provider ${kind}: ${firstLine(error)}`;
      await this.log(record);
      return this.end(kind === "timeout" ? "timeout" : kind === "budget" ? "budget_exhausted" : "provider_error", record.detail);
    }
    const inTokens = response.usage?.inputTokens ?? inputEstimate;
    const outTokens = response.usage?.outputTokens ?? estimateTokens(response.text);
    if (!response.usage) this.usage.estimated = true;
    this.usage.inputTokens += inTokens;
    this.usage.outputTokens += outTokens;
    record.modelCall = {
      requestedModel: response.requestedModel, returnedModel: response.returnedModel ?? null, inputTokens: inTokens, outputTokens: outTokens,
      usageEstimated: !response.usage, latencyMs: response.latencyMs, responseSha256: sha256(response.text), responseExcerpt: response.text.slice(0, 300),
    };

    const decision = parseDecision(response.text);
    if (!decision.ok) {
      record.outcome = "invalid_output"; record.detail = decision.reason;
      await this.log(record);
      return this.end("invalid_model_output", decision.reason);
    }
    record.action = asRecord(decision.raw);

    const checked = await this.validate(decision.raw);
    let keepGoing = true;
    if (!checked.ok) {
      const denial = this.deny({ source: "executor_validation", reason: checked.reason, detail: checked.detail, url: checked.url ?? null, attemptedAction: asRecord(decision.raw) });
      record.outcome = "denied"; record.detail = `${denial.reason}: ${denial.detail}`;
    } else {
      record.action = checked.action as Record<string, unknown>;
      this.consecutiveUnknown = checked.action.type === "unknown" ? this.consecutiveUnknown + 1 : 0;
      try {
        record.detail = await this.execute(checked.action);
        record.outcome = checked.action.type === "finish" ? "finished" : this.denials.length > denialsBefore ? "denied" : "executed";
        if (checked.action.type === "finish") keepGoing = false;
      } catch (error) {
        if (this.ac.signal.aborted) return false;
        record.detail = `action failed: ${firstLine(error)}`;
        record.outcome = this.denials.length > denialsBefore ? "denied" : "executed";
      }
      if (keepGoing && this.consecutiveUnknown >= MAX_CONSECUTIVE_UNKNOWN) { this.end("completed", "two consecutive unknown actions"); keepGoing = false; }
    }
    record.evidenceIds = this.evidence.slice(evidenceBefore).map((item) => item.id);
    record.denialIds = this.denials.slice(denialsBefore).map((item) => item.id);
    await this.log(record);
    await this.flush();
    return keepGoing;
  }

  // Validates the chosen action against the schema AND the legal-action list derived from the current observation.
  private async validate(raw: unknown): Promise<Checked> {
    const type = raw && typeof raw === "object" ? (raw as { type?: unknown }).type : undefined;
    if (typeof type !== "string" || !(ACTION_TYPES as readonly string[]).includes(type)) {
      return { ok: false, reason: "forbidden_action_type", detail: `action type ${JSON.stringify(type)} is not in the action union` };
    }
    const parsed = ActionSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: "invalid_action_fields", detail: `${type}: ${parsed.error.issues[0]?.path.join(".") || "action"} ${parsed.error.issues[0]?.message ?? "invalid"}` };
    const action = parsed.data;
    if (action.type === "navigate") {
      let target: string;
      try { target = new URL(action.url, this.page.url()).toString(); } catch { return { ok: false, reason: "scheme_not_allowed", detail: "unparseable URL" }; }
      const decision = await this.policy.checkNavigationTarget(target);
      if (!decision.allow) return { ok: false, reason: decision.reason, detail: decision.detail, url: target };
      const normalized = this.policy.normalize(target);
      if (!this.discovered.has(normalized)) return { ok: false, reason: "url_not_discovered", detail: "URL was never seen as a link in this session", url: target };
      if (!this.surfaces.has(normalized) && this.surfaces.size >= this.limits.maxSurfaces) return { ok: false, reason: "surface_limit", detail: `maxSurfaces ${this.limits.maxSurfaces} reached`, url: target };
    }
    if (action.type === "activate") {
      const element = this.elements.get(action.targetRef);
      if (!element) return { ok: false, reason: "unknown_target_ref", detail: `no element ${action.targetRef} in the current observation` };
      if (!this.observation.legal.activate.includes(action.targetRef)) return { ok: false, reason: "activation_not_safe", detail: `${action.targetRef} is not safe to activate: ${element.safetyReason}` };
    }
    if (action.type === "capture_evidence" && action.targetRef && !this.elements.has(action.targetRef)) return { ok: false, reason: "unknown_target_ref", detail: `no element ${action.targetRef} in the current observation` };
    return { ok: true, action };
  }

  private async summary() {
    return this.page.evaluate(() => {
      const active = document.activeElement;
      return {
        url: location.href,
        active: active ? { tag: active.tagName.toLowerCase(), id: active.id || null, name: (active.getAttribute("aria-label") || active.textContent || "").trim().slice(0, 80) } : null,
        expandedTrue: document.querySelectorAll('[aria-expanded="true"]').length,
        dialogsOpen: Array.from(document.querySelectorAll("[role=dialog],dialog")).filter((d) => (d as HTMLElement).getClientRects().length > 0).length,
        scrollY: Math.round(window.scrollY),
      };
    });
  }

  private async record(kind: EvidenceRecord["kind"], pre: Record<string, unknown>, target: ElementFacts | null, extra: { screenshot?: EvidenceRecord["screenshot"]; note?: string | null; domFacts?: Record<string, unknown> } = {}): Promise<void> {
    this.evidence.push({
      id: `ev_${this.evidence.length + 1}`, sessionId: this.config.sessionId, step: this.step, timestamp: new Date().toISOString(), url: this.page.url(), kind,
      target: target ? { ref: target.ref, tag: target.tag, role: target.role, name: target.name, id: target.id, selectorHint: target.selectorHint } : null,
      pre, post: await this.summary(), domFacts: extra.domFacts ?? {}, screenshot: extra.screenshot ?? null, note: extra.note ?? null,
    });
  }

  private async execute(action: Action): Promise<string> {
    const { page } = this;
    const pre = await this.summary();
    switch (action.type) {
      case "navigate": {
        const target = new URL(action.url, page.url()).toString();
        const denialsBefore = this.denials.length;
        const previous = page.url();
        try {
          await page.goto(target, { waitUntil: "domcontentloaded", timeout: 15_000 });
        } catch (error) {
          if (this.ac.signal.aborted || this.denials.length === denialsBefore) throw error;
          // A blocked main-frame navigation can leave the tab on a browser error page; return to the last allowed page.
          // Chromium commits that error page asynchronously, so wait for it before navigating back.
          await page.waitForURL((url) => url.protocol === "chrome-error:", { timeout: 800 }).catch(() => undefined);
          if (page.url() !== previous) await page.goto(previous, { waitUntil: "domcontentloaded", timeout: 15_000 });
          return `navigation to ${target} was blocked by the browser policy`;
        }
        await page.waitForTimeout(150);
        if (!this.policy.isAllowedOrigin(page.url())) throw new Error(`landed off-allowlist at ${page.url()}`);
        const landed = this.policy.normalize(page.url());
        this.surfaces.add(landed);
        await this.record("navigate", pre, null, { domFacts: { requested: target, landed } });
        return `navigated to ${landed}`;
      }
      case "inspect_semantics":
        await this.record("inspect_semantics", pre, null, { domFacts: this.digest() });
        return "recorded semantic snapshot";
      case "focus_next": case "focus_prev": {
        const key = action.type === "focus_next" ? "Tab" : "Shift+Tab";
        await page.keyboard.press(key);
        await this.record(action.type, pre, null);
        return `pressed ${key}`;
      }
      case "escape":
        await page.keyboard.press("Escape");
        await this.record("escape", pre, null);
        return "pressed Escape";
      case "scroll":
        await page.evaluate((dy) => window.scrollBy(0, dy), action.direction === "down" ? 600 : -600);
        await this.record("scroll", pre, null);
        return `scrolled ${action.direction}`;
      case "activate": {
        const target = this.elements.get(action.targetRef)!;
        const locator = page.locator(ELEMENT_SELECTOR).nth(Number(action.targetRef.slice(1)));
        const live = await classifyActivation(locator);
        if (!live.safe) {
          this.deny({ source: "executor_validation", reason: "activation_not_safe", detail: `re-check before click failed: ${live.reason}`, url: page.url(), attemptedAction: asRecord(action) });
          return "activation refused on re-check";
        }
        await locator.click({ timeout: 3000 });
        await page.waitForTimeout(150);
        this.lastActivated = { ref: target.ref, tag: target.tag, name: target.name, id: target.id };
        await this.record("activate", pre, target);
        if (!this.policy.isAllowedOrigin(page.url())) throw new Error(`activation landed off-allowlist at ${page.url()}`);
        return `activated ${target.ref} (${target.name || target.tag})`;
      }
      case "capture_evidence": {
        const target = action.targetRef ? this.elements.get(action.targetRef) ?? null : null;
        const rel = join("evidence", `ev_${this.evidence.length + 1}.png`);
        const buffer = await page.screenshot({ fullPage: false });
        await writeFile(join(this.outDir, rel), buffer);
        await this.record("capture_evidence", pre, target, { screenshot: { path: rel, sha256: sha256(buffer) }, note: action.note ?? null, domFacts: this.digest() });
        return `captured ev_${this.evidence.length}`;
      }
      case "finish": {
        this.end("completed", `model finished: ${action.verdict}`);
        this.finishSummary = action.summary;
        for (const raw of action.candidates) {
          const id = `cand_${this.candidates.length + 1}`;
          const parsed = CandidateFindingSchema.safeParse(raw);
          if (!parsed.success) {
            this.candidates.push({ id, step: this.step, status: "rejected", rejection: `schema: ${parsed.error.issues[0]?.message ?? "invalid"}`.slice(0, 200), finding: raw });
            continue;
          }
          const missing = parsed.data.observationRefs.filter((ref) => !this.evidence.some((item) => item.id === ref));
          this.candidates.push(missing.length
            ? { id, step: this.step, status: "rejected", rejection: `unresolved evidence refs: ${missing.join(", ")}`, finding: parsed.data }
            : { id, step: this.step, status: "candidate", rejection: null, finding: parsed.data });
        }
        return `finish ${action.verdict}; ${action.candidates.length} candidate(s) submitted`;
      }
      case "unknown":
        return `unknown: ${action.reason}`;
    }
  }

  private digest(): Record<string, unknown> {
    const o = this.observation;
    return {
      title: o.title, lang: o.lang, headings: o.headings.length, links: o.links.length, controls: o.controls.length,
      unnamedLinks: o.links.filter((link) => !link.hasAccessibleName).map((link) => link.selectorHint),
      unnamedControls: o.controls.filter((control) => !control.hasAccessibleName && control.visible).map((control) => control.selectorHint),
      skipLinks: o.skipLinks, dialogs: o.dialogs, focus: o.focus,
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function runSession(options: RunSessionOptions): Promise<SessionResult> {
  const config = SessionConfigSchema.parse(options.config);
  const skillText = await readFile(SKILL_PATH, "utf8");
  const pinned: PinnedVersions = {
    codeSha: options.codeSha ?? codeSha(), skillVersion: SKILL_VERSION, skillSha256: sha256(skillText),
    modelId: options.provider.requestedModel, configHash: configHash(config),
  };
  await mkdir(join(options.outDir, "evidence"), { recursive: true });
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const session = new Session(config, options, skillText);

  const onOuterAbort = () => session.abort("cancelled");
  if (options.signal?.aborted) onOuterAbort(); else options.signal?.addEventListener("abort", onOuterAbort, { once: true });
  const timer = setTimeout(() => session.abort("timeout"), config.limits.maxWallMs);
  timer.unref();

  const ownsBrowser = !options.browser;
  let browser: Browser | null = null;
  try {
    browser = options.browser ?? await launchSandboxBrowser();
    await session.run(browser);
  } catch (error) {
    if (!session.cause) { session.status = "error"; session.reason = firstLine(error); }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onOuterAbort);
    if (session.cause) {
      session.status = session.cause;
      session.reason = session.cause === "timeout" ? `maxWallMs ${config.limits.maxWallMs} elapsed` : "cancelled by caller";
    }
    await session.closeContext();
    if (ownsBrowser) await browser?.close().catch(() => undefined);
  }

  const result = SessionResultSchema.parse({
    schema: "art/adaptive-result/v1", sessionId: config.sessionId, status: session.status, reason: session.reason, startedAt,
    durationMs: Date.now() - startedAtMs, steps: session.trace.length, modelCalls: session.modelCalls, usage: session.usage,
    responseBytes: session.policy.responseBytes, cost: "unavailable", surfacesVisited: [...session.surfaces], statesVisited: [...session.states],
    evidenceCount: session.evidence.length, candidateCount: session.candidates.filter((item) => item.status === "candidate").length,
    rejectedCandidateCount: session.candidates.filter((item) => item.status === "rejected").length, denialCount: session.denials.length,
    pinned, finishSummary: session.finishSummary,
    artifacts: ["result.json", "trace.jsonl", "observations.jsonl", "evidence.json", "denials.json", "candidates.json"],
  });
  await session.flush();
  await appendFile(join(options.outDir, "trace.jsonl"), "");
  await appendFile(join(options.outDir, "observations.jsonl"), "");
  await writeFile(join(options.outDir, "result.json"), JSON.stringify(result, null, 2));
  return result;
}
