// Frontier ledger for the adaptive harness: which pages, states and probe obligations exist, and which of them actually ran.
// Fed only by executor events (observations the browser produced, evidence records, policy denials). Model text, including a
// finish summary that claims coverage, never changes it. Pure bookkeeping: no fs, no browser; the executor persists it.
// Deliberately not a universal state graph, and pages that look alike are never assumed to behave alike.
import {
  FrontierLedgerSchema, type EvidenceRecord, type ExplorationCondition, type FrontierLedger, type FrontierObligation, type FrontierPage,
  type FrontierProbe, type FrontierState, type Observation, type PolicyDenial, type TerminalStatus,
} from "./contracts.js";
import { stateKey } from "./executor.js";

export type FrontierBounds = FrontierLedger["bounds"];
export const DEFAULT_FRONTIER_BOUNDS: FrontierBounds = { maxPages: 200, maxStates: 400, maxObligations: 2000 };

// The model action that ran just before an observation; it is the transition identity of any state or link that observation reveals.
export type Transition = { type: string; targetRef: string | null; step: number };

type Control = Observation["controls"][number];
type Target = { id: string | null; name: string; selectorHint: string };

const NOT_APPLICABLE = "not applicable: no skip link observed on this page";
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
  private readonly dropped = { pages: 0, states: 0, obligations: 0 };
  private readonly clipping: FrontierLedger["modelVisibleClipping"] = [];
  private lastPageId: string | null = null;
  private skipRefs = new Set<string>();
  // An activated dialog trigger waiting for its escape; cleared by any other activation.
  private openDialog: { pageId: string; subject: string; evidenceId: string } | null = null;
  private updatedAtStep = 0;
  private terminal: { status: TerminalStatus; reason: string } | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly condition: ExplorationCondition,
    private readonly normalize: (url: string) => string,
    private readonly bounds: FrontierBounds = DEFAULT_FRONTIER_BOUNDS,
  ) {}

  private addPage(url: string, discovery: FrontierPage["discovery"]): FrontierPage | null {
    const known = this.pages.get(url);
    if (known) return known;
    if (this.pages.size >= this.bounds.maxPages) { this.truncated.pages = true; this.dropped.pages += 1; return null; }
    const page: FrontierPage = { id: `p${this.pages.size + 1}`, url, discovery, modelVisible: false, firstModelVisibleStep: null, visited: false, firstVisitedStep: null };
    this.pages.set(url, page);
    this.addObligation(page.id, null, "semantics", null, true);
    this.addObligation(page.id, null, "skip_link", null, false);
    return page;
  }

  private addObligation(pageId: string, stateId: string | null, probe: FrontierProbe, subject: string | null, known: boolean): void {
    const key = `${pageId}|${probe}|${subject ?? ""}`;
    if (this.obligations.has(key)) return;
    if (this.obligations.size >= this.bounds.maxObligations) { this.truncated.obligations = true; this.dropped.obligations += 1; return; }
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
      if (this.states.size >= this.bounds.maxStates) { this.truncated.states = true; this.dropped.states += 1; }
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

  setTerminal(status: TerminalStatus, reason: string): void {
    this.terminal = { status, reason };
  }

  snapshot(): FrontierLedger {
    const obligations = [...this.obligations.values()];
    const count = (status: FrontierObligation["status"]) => obligations.filter((item) => item.status === status).length;
    return FrontierLedgerSchema.parse({
      schema: "art/adaptive-frontier/v1", sessionId: this.sessionId, condition: this.condition, updatedAtStep: this.updatedAtStep,
      bounds: this.bounds, truncated: this.truncated, dropped: this.dropped, modelVisibleClipping: this.clipping,
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
