// Deterministic frontier scheduler (condition D). It is a ModelProvider so that its actions go through exactly the same validation,
// execution, containment, budgets and denials as a model's; it makes no model call and costs nothing. It reads only the observation
// it is sent (with the frontier visible) plus its own state. Never fixture truth, file names or text as signals.
//
// Frozen ordering (frontier-scheduler/v1):
//   1. Pages breadth-first in discovery order (page id, compared numerically). The current page is finished before moving on.
//   2. Within a page, probes in this order: semantics (which also records skip links), disclosures/menus, dialogs
//      (activate, check focus-in, Escape, check focus return). Ties by obligation id, i.e. discovery and element order.
//   3. Sampling: at most condition.sampling.maxPagesPerSource pages per discovery source; surfaces, steps and calls are the
//      executor's caps, unchanged.
// Interpretation is the separate rule table in frontier-rules.ts; each finding is captured on its element and reported with
// report_candidate, citing the probe's evidence and the capture.
import { CandidateFindingSchema, type Observation } from "./contracts.js";
import { SCHEDULER_PROVIDER_ID } from "./executor.js";
import { RULES_VERSION, dialogClosedFindings, dialogOpenedFindings, pageFindings, ruleLimitations, type RuleFinding } from "./frontier-rules.js";
import type { ModelProvider, ModelRequest, ModelResponse, ProviderCapabilities } from "./provider.js";
import { parseObservation } from "./providers/fake.js";

export const SCHEDULER_VERSION = "frontier-scheduler/v1";
const PROBE_ORDER = ["semantics", "skip_link", "disclosure_toggle", "dialog_focus_return"];
const num = (id: string) => Number(id.slice(1));

type Action = Record<string, unknown>;
type Dialog = { ref: string; hint: string; stage: "opened" | "escaped"; activateEvidence: string[] };

export class FrontierScheduler implements ModelProvider {
  readonly id = SCHEDULER_PROVIDER_ID;
  readonly requestedModel = SCHEDULER_VERSION;
  readonly capabilities: ProviderCapabilities = { jsonObject: true, jsonSchema: false, toolCalling: false, vision: false, verified: false };
  readonly rulesVersion = RULES_VERSION;
  calls = 0;

  private readonly pageUrl = new Map<string, string>();
  private readonly pageSource = new Map<string, string | null>();
  private readonly visited = new Set<string>();
  private readonly skipped = new Set<string>();
  private readonly attempted = new Set<string>();
  private readonly reportedKeys = new Set<string>();
  private queue: RuleFinding[] = [];
  private awaitingCapture: RuleFinding | null = null;
  private awaitingInspect: string | null = null;
  private dialog: Dialog | null = null;
  private navigatingTo: string | null = null;

  constructor(private readonly options: { maxPagesPerSource: number }) {}

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const startedAt = Date.now();
    this.calls += 1;
    const action = this.decide(parseObservation(request));
    const text = JSON.stringify({ action, rationale: `${SCHEDULER_VERSION} / ${RULES_VERSION}` });
    return {
      text, requestedModel: SCHEDULER_VERSION, returnedModel: SCHEDULER_VERSION, usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: Date.now() - startedAt,
      parameters: { temperature: request.temperature, maxOutputTokens: request.maxOutputTokens, responseFormat: request.responseFormat },
    };
  }

  decide(o: Observation | null): Action {
    if (!o || !o.frontier) return { type: "unknown", reason: "the scheduler needs an observation with the frontier visible" };
    const view = o.frontier;
    const current = view.pages.find((page) => page.current)?.id ?? null;
    for (const page of view.pages) {
      if (!this.pageUrl.has(page.id)) { this.pageUrl.set(page.id, page.url); this.pageSource.set(page.id, page.current ? null : current); }
      if (page.visited) this.visited.add(page.id);
    }
    const last = o.recentActions.at(-1);
    const lastEvidence = last?.evidenceIds ?? [];
    if (this.navigatingTo && this.navigatingTo !== current) this.skipped.add(this.navigatingTo);
    this.navigatingTo = null;

    // Rule table inputs, in the order the probes ran.
    if (this.awaitingInspect && this.awaitingInspect === current) {
      this.awaitingInspect = null;
      if (lastEvidence.length) this.enqueue(current, pageFindings(o, lastEvidence));
    }
    // On the final call, findings not yet reported go into finish; they are validated exactly like report_candidate.
    if (o.finalCall) return this.finish(o, lastEvidence);
    if (this.dialog) {
      const dialog = this.dialog;
      if (dialog.stage === "opened") {
        dialog.activateEvidence = lastEvidence;
        this.enqueue(current, dialogOpenedFindings(o, dialog, lastEvidence));
        dialog.stage = "escaped";
        return { type: "escape" };
      }
      this.dialog = null;
      this.enqueue(current, dialogClosedFindings(o, { ref: this.refFor(o, dialog.hint) ?? dialog.ref, hint: dialog.hint }, [...dialog.activateEvidence, ...lastEvidence]));
    }
    if (this.awaitingCapture) {
      const finding = this.awaitingCapture;
      this.awaitingCapture = null;
      if (lastEvidence.length) return { type: "report_candidate", candidate: this.candidate(finding, lastEvidence) };
    }
    const next = this.queue.shift();
    if (next) {
      const ref = next.targetRef ? this.refFor(o, next.hint) ?? next.targetRef : null;
      this.awaitingCapture = next;
      return { type: "capture_evidence", ...(ref ? { targetRef: ref } : {}), note: `${next.rule}: ${next.hint}`.slice(0, 300) };
    }

    // Next probe on the current page.
    const outstanding = view.outstanding
      .filter((item) => item.pageId === current && item.status === "pending" && !this.attempted.has(item.id))
      .sort((a, b) => PROBE_ORDER.indexOf(a.probe) - PROBE_ORDER.indexOf(b.probe) || num(a.id) - num(b.id));
    for (const item of outstanding) {
      this.attempted.add(item.id);
      if (item.probe === "semantics" || item.probe === "skip_link") {
        // inspect_semantics records both; mark the sibling probe attempted too.
        for (const other of outstanding) if (other.probe === "semantics" || other.probe === "skip_link") this.attempted.add(other.id);
        this.awaitingInspect = current;
        return { type: "inspect_semantics" };
      }
      if (!item.targetRef || !o.legal.activate.includes(item.targetRef)) continue;
      const hint = [...o.controls].find((control) => control.ref === item.targetRef)?.selectorHint ?? item.targetRef;
      if (item.probe === "dialog_focus_return") this.dialog = { ref: item.targetRef, hint, stage: "opened", activateEvidence: [] };
      return { type: "activate", targetRef: item.targetRef };
    }

    // Next page: lowest unvisited id within the sampling scope, while surfaces remain.
    if (o.budget.surfacesLeft > 0) {
      const perSource = new Map<string, number>();
      const ranked = [...this.pageUrl.keys()].sort((a, b) => num(a) - num(b)).filter((id) => {
        const source = this.pageSource.get(id) ?? "start";
        const rank = perSource.get(source) ?? 0;
        perSource.set(source, rank + 1);
        return rank < this.options.maxPagesPerSource;
      });
      const target = ranked.find((id) => !this.visited.has(id) && !this.skipped.has(id) && id !== current);
      if (target) { this.navigatingTo = target; return { type: "navigate", url: this.pageUrl.get(target)! }; }
    }
    return this.finish(o);
  }

  private enqueue(pageId: string | null, findings: RuleFinding[]): void {
    for (const finding of findings) {
      const key = `${finding.category}|${pageId}|${finding.hint}`;
      if (this.reportedKeys.has(key)) continue;
      this.reportedKeys.add(key);
      this.queue.push(finding);
    }
  }

  // Refs shift between observations; find the element again by its selector hint.
  private refFor(o: Observation, hint: string): string | null {
    return [...o.controls, ...o.links].find((element) => element.selectorHint === hint)?.ref ?? o.skipLinks.find((skip) => `skip link ${skip.href}` === hint)?.ref ?? null;
  }

  private candidate(finding: RuleFinding, captured: string[]) {
    return CandidateFindingSchema.parse({
      category: finding.category, claim: finding.claim.slice(0, 600), observationRefs: [...new Set([...finding.probeEvidence, ...captured])].slice(0, 20),
      reproductionSteps: finding.reproduction, limitations: ruleLimitations(), proposedDeterministicCheck: `${finding.rule} in ${RULES_VERSION}`,
    });
  }

  private finish(o: Observation, lastEvidence: string[] = []): Action {
    const candidates = [
      ...(this.awaitingCapture && lastEvidence.length ? [this.candidate(this.awaitingCapture, lastEvidence)] : []),
      ...this.queue.filter((finding) => finding.probeEvidence.length).map((finding) => this.candidate(finding, [])),
    ].slice(0, 20);
    this.awaitingCapture = null; this.queue = [];
    const done = (o.frontier?.outstanding.length ?? 1) === 0 && o.frontier?.remaining === 0;
    return { type: "finish", verdict: done ? "complete" : "inconclusive", summary: `${SCHEDULER_VERSION}: frontier exhausted within caps; findings were reported with report_candidate or in this finish.`, candidates };
  }
}
