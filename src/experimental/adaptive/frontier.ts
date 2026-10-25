// Frontier ledger for the adaptive harness: which pages, states and probe obligations exist, and which of them actually ran.
// Fed only by executor events (observations the browser produced, evidence records, policy denials). Model text, including a
// finish summary that claims coverage, never changes it. Pure bookkeeping: no fs, no browser; the executor persists it.
// Deliberately not a universal state graph, and pages that look alike are never assumed to behave alike.
import {
  FrontierLedgerSchema, type EvidenceRecord, type ExplorationCondition, type FrontierLedger, type FrontierObligation, type FrontierPage,
  type Completion, type FrontierProbe, type FrontierState, type Observation, type PolicyDenial, type TerminalStatus,
} from "./contracts.js";
import { stateKey } from "./state.js";

export type FrontierBounds = FrontierLedger["bounds"];
export const DEFAULT_FRONTIER_BOUNDS: FrontierBounds = { maxPages: 200, maxStates: 400, maxObligations: 2000 };
// Size of the compact view shown to the model (condition flag ledgerVisible). The full ledger is always in frontier.json.
export type CompactBounds = { pages: number; outstanding: number; outcomes: number };
export const DEFAULT_COMPACT_BOUNDS: CompactBounds = { pages: 25, outstanding: 40, outcomes: 20 };
const MAX_COMPLETION_LIST = 50;

export type CompactView = NonNullable<Observation["frontier"]>;
// Per-turn record of what the compact view showed and left out: cut by the compact bound, or not shown because the page is
// unvisited and either no surfaces remain or it is outside the sampling scope.
export type CompactLog = {
  step: number;
  shown: { pages: string[]; outstanding: string[]; outcomes: string[] };
  clipped: { pages: string[]; outstanding: string[]; outcomes: string[] };
  notShown: { pages: string[]; obligations: string[] };
  ledgerTruncated: boolean;
};

// The model action that ran just before an observation; it is the transition identity of any state or link that observation reveals.
export type Transition = { type: string; targetRef: string | null; step: number };

type Control = Observation["controls"][number];
type Target = { id: string | null; name: string; selectorHint: string };

const NOT_APPLICABLE = "not applicable: no skip link observed on this page";
const MAX_DROPPED_KEYS = 5000;
const DIALOG_ROLES = new Set(["dialog", "alertdialog"]);

// A control's identity across observations. Refs (eN) are DOM-index based and shift, so they are never used here.
export const subjectOf = (target: Target): string => target.id ? `#${target.id}` : `${target.name}|${target.selectorHint}`;

function probeFor(control: Control): { probe: FrontierProbe; known: boolean } | null {
  if (!control.visible || !(control.controls || control.expanded !== null || control.haspopup)) return null;
  const dialog = DIALOG_ROLES.has(control.controlsRole ?? "") || control.haspopup === "dialog";
  if (dialog) return { probe: "dialog_focus_return", known: DIALOG_ROLES.has(control.controlsRole ?? "") };
  return { probe: "disclosure_toggle", known: control.expanded !== null };
}

export class Frontier {
  private readonly pages = new Map<string, FrontierPage>(); // by canonical URL
  private readonly states = new Map<string, FrontierState>(); // by stateKey
  private readonly obligations = new Map<string, FrontierObligation>(); // by page|probe|subject
  private readonly truncated = { pages: false, states: false, obligations: false };
  // Keys refused by a bound. The same link or control is re-offered every turn, so drops are counted once per key; the sets are capped too.
  private readonly droppedKeys = { pages: new Set<string>(), states: new Set<string>(), obligations: new Set<string>() };
  private droppedOverflow = { pages: 0, states: 0, obligations: 0 };
  private readonly clipping: FrontierLedger["modelVisibleClipping"] = [];
  private lastPageId: string | null = null;
  private skipRefs = new Set<string>();
  // An activated dialog trigger waiting for its escape; cleared by any other activation.
  private openDialog: { pageId: string; subject: string; evidenceId: string } | null = null;
  private updatedAtStep = 0;
  private terminal: { status: TerminalStatus; reason: string } | null = null;
  // Control subject -> ref in the latest observation, so the compact view can point at a control without naming it.
  private currentRefs = new Map<string, string>();
  private currentUrl = "";

  constructor(
    private readonly sessionId: string,
    private readonly condition: ExplorationCondition,
    private readonly normalize: (url: string) => string,
    private readonly bounds: FrontierBounds = DEFAULT_FRONTIER_BOUNDS,
    private readonly compactBounds: CompactBounds = DEFAULT_COMPACT_BOUNDS,
  ) {}

  private drop(kind: keyof Frontier["droppedKeys"], key: string): void {
    this.truncated[kind] = true;
    const keys = this.droppedKeys[kind];
    if (keys.has(key)) return;
    if (keys.size < MAX_DROPPED_KEYS) keys.add(key); else this.droppedOverflow[kind] += 1;
  }

  private addPage(url: string, discovery: FrontierPage["discovery"]): FrontierPage | null {
    const known = this.pages.get(url);
    if (known) return known;
    if (this.pages.size >= this.bounds.maxPages) { this.drop("pages", url); return null; }
    const page: FrontierPage = { id: `p${this.pages.size + 1}`, url, discovery, modelVisible: false, firstModelVisibleStep: null, visited: false, firstVisitedStep: null };
    this.pages.set(url, page);
    this.addObligation(page.id, null, "semantics", null, true);
    this.addObligation(page.id, null, "skip_link", null, false);
    return page;
  }

  private addObligation(pageId: string, stateId: string | null, probe: FrontierProbe, subject: string | null, known: boolean): void {
    const key = `${pageId}|${probe}|${subject ?? ""}`;
    if (this.obligations.has(key)) return;
    if (this.obligations.size >= this.bounds.maxObligations) { this.drop("obligations", key); return; }
    this.obligations.set(key, {
      id: `o${this.obligations.size + 1}`, pageId, stateId, probe, subject, applicability: known ? "known" : "unknown", status: "pending", evidenceIds: [], reason: null,
    });
  }

  private obligation(pageId: string, probe: FrontierProbe, subject: string | null = null): FrontierObligation | undefined {
    return this.obligations.get(`${pageId}|${probe}|${subject ?? ""}`);
  }

  private execute(obligation: FrontierObligation | undefined, evidenceIds: string[]): void {
    if (!obligation || obligation.status === "executed") return;
    obligation.status = "executed"; obligation.applicability = "known"; obligation.reason = null;
    obligation.evidenceIds.push(...evidenceIds);
  }

  // Registers what the browser showed at this step. Applicability may be learned here; execution never is.
  observe(input: { step: number; observation: Observation; discoveredNow: string[]; previous: Transition | null }): void {
    const { step, observation, previous } = input;
    this.updatedAtStep = step;
    const url = this.normalize(observation.url);
    this.currentUrl = url;
    this.currentRefs = new Map(observation.controls.filter((control) => probeFor(control)).map((control) => [subjectOf(control), control.ref]));
    const page = this.pages.get(url) ?? this.addPage(url, this.pages.size === 0
      ? { kind: "start", step }
      : this.lastPageId && previous
        ? { kind: "revealed", onPage: this.lastPageId, step, afterAction: previous.type, afterStep: previous.step }
        : { kind: "link", onPage: this.lastPageId ?? "unknown", step });
    const samePage = page !== null && page.id === this.lastPageId;
    if (page) {
      if (!page.visited) { page.visited = true; page.firstVisitedStep = step; }
      this.lastPageId = page.id;
      const skip = this.obligation(page.id, "skip_link");
      if (skip && skip.status !== "executed") {
        if (observation.skipLinks.length) {
          skip.applicability = "known";
          if (skip.status === "deferred" && skip.reason === NOT_APPLICABLE) { skip.status = "pending"; skip.reason = null; }
        } else if (skip.status === "pending") {
          skip.applicability = "known"; skip.status = "deferred"; skip.reason = NOT_APPLICABLE;
        }
      }
    }
    this.skipRefs = new Set(observation.skipLinks.map((skip) => skip.ref));

    if (page) {
      for (const link of input.discoveredNow) {
        if (link === url || this.pages.has(link)) continue;
        // A link that appears after a non-navigation action on the same page was revealed by that action (menus, disclosures).
        this.addPage(link, samePage && previous && previous.type !== "navigate"
          ? { kind: "revealed", onPage: page.id, step, afterAction: previous.type, afterStep: previous.step }
          : { kind: "link", onPage: page.id, step });
      }
    }

    for (const target of observation.legal.navigate) {
      const visible = this.pages.get(this.normalize(target));
      if (visible && !visible.modelVisible) { visible.modelVisible = true; visible.firstModelVisibleStep = step; }
    }
    if (!observation.finalCall) {
      const navigable = new Set(observation.links.filter((link) => link.navigable).map((link) => this.normalize(link.href)).filter((link) => link !== url)).size;
      if (observation.legal.navigate.length < navigable) this.clipping.push({ step, shown: observation.legal.navigate.length, navigable });
    }

    if (!page) return;
    const key = stateKey(observation, this.normalize);
    let state = this.states.get(key);
    if (!state) {
      if (this.states.size >= this.bounds.maxStates) this.drop("states", key);
      else {
        const focus = observation.focus ? (observation.focus.isBody ? "body" : observation.focus.id ? `#${observation.focus.id}` : `${observation.focus.tag}|${observation.focus.name}`) : null;
        state = {
          id: `s${this.states.size + 1}`, pageId: page.id, key,
          preconditions: { expandedControls: observation.controls.filter((control) => control.expanded === "true").map((control) => control.name || control.ref).sort(), dialogOpen: observation.dialogs.some((dialog) => dialog.visible), focus },
          transition: this.states.size === 0 ? null : previous, firstStep: step,
        };
        this.states.set(key, state);
      }
    }
    // One obligation per control per page, even when siblings share a template.
    for (const control of observation.controls) {
      const probe = probeFor(control);
      if (probe) this.addObligation(page.id, state?.id ?? null, probe.probe, subjectOf(control), probe.known);
    }
  }

  // Evidence the executor recorded this turn. This is the only path to "executed".
  recordEvidence(records: EvidenceRecord[]): void {
    for (const record of records) {
      const before = typeof record.pre["url"] === "string" ? record.pre["url"] : record.url;
      const page = this.pages.get(this.normalize(before));
      if (!page) continue;
      if (record.kind === "inspect_semantics" || record.kind === "capture_evidence") {
        this.execute(this.obligation(page.id, "semantics"), [record.id]);
        // The digest carries the skip-link facts; an empty list leaves the not-applicable deferral in place.
        const skipLinks = record.domFacts["skipLinks"];
        if (Array.isArray(skipLinks) && skipLinks.length) this.execute(this.obligation(page.id, "skip_link"), [record.id]);
      } else if (record.kind === "activate" && record.target) {
        const subject = subjectOf(record.target);
        if (this.skipRefs.has(record.target.ref)) this.execute(this.obligation(page.id, "skip_link"), [record.id]);
        this.execute(this.obligation(page.id, "disclosure_toggle", subject), [record.id]);
        this.openDialog = this.obligation(page.id, "dialog_focus_return", subject) ? { pageId: page.id, subject, evidenceId: record.id } : null;
      } else if (record.kind === "escape" && this.openDialog?.pageId === page.id) {
        this.execute(this.obligation(page.id, "dialog_focus_return", this.openDialog.subject), [this.openDialog.evidenceId, record.id]);
        this.openDialog = null;
      }
    }
  }

  // A refused navigation to a known page blocks that page's outstanding work. A URL the model made up never becomes a page.
  recordDenials(denials: PolicyDenial[]): void {
    for (const denial of denials) {
      if (denial.attemptedAction?.["type"] !== "navigate" || !denial.url) continue;
      const page = this.pages.get(this.normalize(denial.url));
      if (!page) continue;
      for (const obligation of this.obligations.values()) {
        if (obligation.pageId === page.id && obligation.status === "pending") { obligation.status = "blocked"; obligation.reason = `navigation refused: ${denial.reason} (${denial.id})`; }
      }
    }
  }

  // The compact view for the model. Only pages that are visited or legal to navigate to this turn are shown; nothing page-derived
  // beyond those canonical URLs (subjects and state preconditions carry element names, so they stay in frontier.json).
  compact(observation: Observation): { view: CompactView; log: CompactLog } {
    const legal = new Set(observation.legal.navigate.map((url) => this.normalize(url)));
    const all = [...this.pages.values()];
    // Shown: visited pages, pages legal this turn, and discovered unvisited pages while surfaces remain and the page is within the
    // sampling scope. Their URLs were shown to the model when discovered and the executor accepts any discovered URL.
    const scope = samplingScope(all, this.condition.sampling.maxPagesPerSource);
    const inBudget = observation.budget.surfacesLeft > 0;
    const eligible = all.filter((page) => page.visited || legal.has(page.url) || (inBudget && scope.has(page.id)));
    const rank = (page: FrontierPage) => page.url === this.currentUrl ? 0 : page.visited ? 2 : 1;
    const ordered = [...eligible].sort((a, b) => rank(a) - rank(b) || Number(a.id.slice(1)) - Number(b.id.slice(1)));
    const pagesShown = ordered.slice(0, this.compactBounds.pages);
    const shownIds = new Set(pagesShown.map((page) => page.id));
    const pageRank = new Map(ordered.map((page, index) => [page.id, index]));
    const obligations = [...this.obligations.values()];
    const outstandingAll = obligations.filter((item) => (item.status === "pending" || item.status === "blocked") && shownIds.has(item.pageId))
      .sort((a, b) => pageRank.get(a.pageId)! - pageRank.get(b.pageId)! || Number(a.id.slice(1)) - Number(b.id.slice(1)));
    const outstanding = outstandingAll.slice(0, this.compactBounds.outstanding);
    const outcomesAll = obligations.filter((item) => item.status === "executed");
    const outcomes = outcomesAll.slice(-this.compactBounds.outcomes);
    const current = this.pages.get(this.currentUrl);
    const eligibleIds = new Set(eligible.map((page) => page.id));
    const notShownPages = all.filter((page) => !eligibleIds.has(page.id));
    const notShownIds = new Set(notShownPages.map((page) => page.id));
    const view: CompactView = {
      pages: pagesShown.map((page) => ({ id: page.id, url: page.url, visited: page.visited, current: page.url === this.currentUrl, discoveredOn: page.discovery.kind === "start" ? null : page.discovery.onPage })),
      outstanding: outstanding.map((item) => ({
        id: item.id, pageId: item.pageId, probe: item.probe, status: item.status, applicability: item.applicability,
        targetRef: item.subject && current?.id === item.pageId ? this.currentRefs.get(item.subject) ?? null : null, reason: item.reason,
      })),
      outcomes: outcomes.map((item) => ({ id: item.id, pageId: item.pageId, probe: item.probe, evidenceIds: item.evidenceIds })),
      remaining: obligations.filter((item) => item.status === "pending").length,
      truncated: {
        pages: pagesShown.length < ordered.length, outstanding: outstanding.length < outstandingAll.length, outcomes: outcomes.length < outcomesAll.length,
        ledger: this.truncated.pages || this.truncated.states || this.truncated.obligations,
      },
      dropped: { pages: ordered.length - pagesShown.length, outstanding: outstandingAll.length - outstanding.length, outcomes: outcomesAll.length - outcomes.length },
    };
    const ids = <T extends { id: string }>(items: T[]) => items.map((item) => item.id);
    const log: CompactLog = {
      step: observation.step,
      shown: { pages: ids(pagesShown), outstanding: ids(outstanding), outcomes: ids(outcomes) },
      clipped: { pages: ids(ordered.slice(this.compactBounds.pages)), outstanding: ids(outstandingAll.slice(this.compactBounds.outstanding)), outcomes: ids(outcomesAll.slice(0, outcomesAll.length - outcomes.length)) },
      notShown: { pages: ids(notShownPages), obligations: ids(obligations.filter((item) => item.status === "pending" && notShownIds.has(item.pageId))) },
      ledgerTruncated: view.truncated.ledger,
    };
    return { view, log };
  }

  // Controller-side completion (condition flag completionAccounting); see classifyCompletion.
  completion(input: CompletionInput): Completion {
    return classifyCompletion(this.snapshot(), input);
  }

  setTerminal(status: TerminalStatus, reason: string): void {
    this.terminal = { status, reason };
  }

  snapshot(): FrontierLedger {
    const obligations = [...this.obligations.values()];
    const count = (status: FrontierObligation["status"]) => obligations.filter((item) => item.status === status).length;
    return FrontierLedgerSchema.parse({
      schema: "art/adaptive-frontier/v1", sessionId: this.sessionId, condition: this.condition, updatedAtStep: this.updatedAtStep,
      bounds: this.bounds, truncated: this.truncated,
      dropped: Object.fromEntries((["pages", "states", "obligations"] as const).map((kind) => [kind, this.droppedKeys[kind].size + this.droppedOverflow[kind]])), modelVisibleClipping: this.clipping,
      pages: [...this.pages.values()], states: [...this.states.values()], obligations,
      completion: {
        remaining: count("pending"),
        byStatus: { pending: count("pending"), executed: count("executed"), blocked: count("blocked"), deferred: count("deferred") },
        exclusions: obligations.filter((item) => item.status === "blocked" || item.status === "deferred").map((item) => ({ obligationId: item.id, reason: item.reason ?? item.status })),
        terminalStatus: this.terminal?.status ?? null, terminalReason: this.terminal?.reason ?? null,
      },
    });
  }
}

export type CompletionInput = { status: TerminalStatus; cancelled: boolean; proposal: Completion["proposal"]; maxPagesPerSource: number };

// Completion from a ledger snapshot: the controller (condition flag completionAccounting) and the evaluator use the same rule.
// The model's finish verdict is only the proposal.
// Exhausted covers both budget_exhausted and timeout (the wall-clock budget). An error terminal is never complete.
export function classifyCompletion(ledger: FrontierLedger, input: CompletionInput): Completion {
  const inScope = samplingScope(ledger.pages, input.maxPagesPerSource);
  const byId = new Map(ledger.pages.map((page) => [page.id, page]));
  const pending: Completion["pending"] = [];
  const exclusions: Completion["exclusions"] = [];
  let blocked = 0;
  for (const item of ledger.obligations) {
    const page = byId.get(item.pageId)!;
    if (item.status === "executed") continue;
    if (item.status === "blocked") { blocked += 1; exclusions.push({ obligationId: item.id, reason: item.reason ?? "blocked" }); continue; }
    if (item.status === "deferred") { exclusions.push({ obligationId: item.id, reason: item.reason ?? "deferred" }); continue; }
    if (!inScope.has(page.id)) { exclusions.push({ obligationId: item.id, reason: `sampled out: beyond the first ${input.maxPagesPerSource} pages from its discovery source` }); continue; }
    if (!page.visited && !page.modelVisible) { exclusions.push({ obligationId: item.id, reason: "not reachable: never visited and never in legal.navigate" }); continue; }
    pending.push({ obligationId: item.id, pageId: page.id, url: page.url, probe: item.probe, applicability: item.applicability });
  }
  const truncated = ledger.truncated.pages || ledger.truncated.states || ledger.truncated.obligations;
  let outcome: Completion["outcome"];
  let reason: string;
  if (input.cancelled) { outcome = "cancelled"; reason = "cancelled by caller"; }
  else if (input.status === "budget_exhausted" || input.status === "timeout") { outcome = "exhausted"; reason = `session ended by a budget (${input.status}) with ${pending.length} relevant obligation(s) pending`; }
  else if (pending.length) { outcome = "partial"; reason = `${pending.length} relevant reachable obligation(s) still pending`; }
  else if (truncated) { outcome = "partial"; reason = "the ledger hit a bound; dropped work is unaccounted for"; }
  else if (blocked) { outcome = "blocked"; reason = `every remaining obligation (${blocked}) was blocked by policy`; }
  else if (input.status === "completed") { outcome = "complete_within_scope"; reason = "no relevant reachable obligation is pending"; }
  else { outcome = "partial"; reason = `session ended with ${input.status}`; }
  return {
    outcome, reason, proposal: input.proposal, scope: { maxPagesPerSource: input.maxPagesPerSource, reachable: "visited or model-visible" },
    pending: pending.slice(0, MAX_COMPLETION_LIST), pendingTruncated: Math.max(0, pending.length - MAX_COMPLETION_LIST), blocked,
    exclusions: exclusions.slice(0, MAX_COMPLETION_LIST), exclusionsTruncated: Math.max(0, exclusions.length - MAX_COMPLETION_LIST),
  };
}

// Declared scope: the first N pages per discovery source (the page a link was first seen on), in discovery (page id) order.
export function samplingScope(pages: Iterable<FrontierPage>, maxPagesPerSource: number): Set<string> {
  const inScope = new Set<string>();
  const perSource = new Map<string, number>();
  for (const page of [...pages].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))) {
    const source = page.discovery.kind === "start" ? "start" : page.discovery.onPage;
    const seen = perSource.get(source) ?? 0;
    perSource.set(source, seen + 1);
    if (seen < maxPagesPerSource) inScope.add(page.id);
  }
  return inScope;
}
