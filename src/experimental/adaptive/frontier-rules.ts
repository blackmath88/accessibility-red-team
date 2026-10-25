// Interpretation rule table for the deterministic scheduler (condition D). A separate, versioned mechanism: it maps probe facts the
// harness observed to candidate findings, each citing the evidence the probe recorded. It is not a model and is scored apart from
// exploration. Whether such a table belongs in the product is an open design decision for the owner.
// Reads only the observation it is given. Never fixture truth, never URLs or text as signals of where a defect is.
import type { Observation } from "./contracts.js";

export const RULES_VERSION = "frontier-rules/v1";
// Hard cap on findings per page, so a page full of unnamed elements cannot eat the session budget.
export const MAX_FINDINGS_PER_PAGE = 6;

export type RuleFinding = {
  rule: string;
  category: string;
  claim: string;
  // Ref of the element in the observation the rule read; the scheduler captures it so the evidence names the element.
  targetRef: string | null;
  // Element identity for evidence notes and duplicate keys: the selector hint, never the accessible name.
  hint: string;
  probeEvidence: string[];
  reproduction: string[];
};

const LIMITATIONS = [`rule table ${RULES_VERSION}, not a model`, "DOM summary, not a screen-reader transcript"];
export const ruleLimitations = () => [...LIMITATIONS];

const refOrder = (ref: string) => Number(ref.slice(1));

// Rules run after inspect_semantics on a page. Order is frozen: unnamed controls and links in element order, then skip links in element order.
export function pageFindings(o: Observation, probeEvidence: string[]): RuleFinding[] {
  const out: RuleFinding[] = [];
  const unnamed = [...o.controls.filter((control) => control.visible && !control.hasAccessibleName).map((control) => ({ ref: control.ref, hint: control.selectorHint })),
    ...o.links.filter((link) => link.visible && !link.hasAccessibleName).map((link) => ({ ref: link.ref, hint: link.selectorHint }))]
    .sort((a, b) => refOrder(a.ref) - refOrder(b.ref));
  for (const element of unnamed) {
    out.push({ rule: "R1-missing-name", category: "missing_accessible_name", claim: `The element ${element.hint} has no accessible name in the DOM summary.`, targetRef: element.ref, hint: element.hint, probeEvidence, reproduction: ["Open the page", "Inspect the element's accessible name"] });
  }
  for (const skip of [...o.skipLinks].sort((a, b) => refOrder(a.ref) - refOrder(b.ref))) {
    if (skip.targetExists && skip.targetIsMain) continue;
    const what = skip.targetExists ? `points to ${skip.href}, which is a ${skip.targetTag ?? "non-main"} element, not the main content` : `points to ${skip.href}, which does not exist`;
    out.push({ rule: "R2-skip-target", category: "skip_link_broken", claim: `The skip link ${what}.`, targetRef: skip.ref, hint: `skip link ${skip.href}`, probeEvidence, reproduction: ["Open the page", "Follow the first skip link"] });
  }
  return out.slice(0, MAX_FINDINGS_PER_PAGE);
}

// Right after a dialog trigger was activated: a dialog is visible but focus is not inside any visible dialog.
export function dialogOpenedFindings(o: Observation, trigger: { ref: string; hint: string }, probeEvidence: string[]): RuleFinding[] {
  const visible = o.dialogs.filter((dialog) => dialog.visible);
  if (!visible.length || visible.some((dialog) => dialog.containsFocus)) return [];
  return [{ rule: "R3-focus-not-in-dialog", category: "focus_not_moved_to_dialog", claim: `Activating ${trigger.hint} opens a dialog but focus does not move into it.`, targetRef: trigger.ref, hint: trigger.hint, probeEvidence, reproduction: ["Open the page", `Activate ${trigger.hint}`, "Check where focus is"] }];
}

// After Escape: focus is not back on the control that opened the dialog.
export function dialogClosedFindings(o: Observation, trigger: { ref: string; hint: string }, probeEvidence: string[]): RuleFinding[] {
  if (o.focus?.matchesLastActivated) return [];
  return [{ rule: "R4-focus-not-returned", category: "dialog_focus_not_returned", claim: `After Escape closes the dialog opened by ${trigger.hint}, focus does not return to it.`, targetRef: trigger.ref, hint: trigger.hint, probeEvidence, reproduction: ["Open the page", `Activate ${trigger.hint}`, "Press Escape", "Check where focus is"] }];
}
