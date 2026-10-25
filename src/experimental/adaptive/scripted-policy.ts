// Deterministic "explorer" used as Arm B's decision policy in CI and fixture trials. It is a scripted stand-in for a model:
// same observation in, same action out, no randomness, no network. It plays the role the versioned skill describes
// (menus and dialogs first, evidence before claims, stop when nothing new is reachable) and nothing more.
import type { CandidateFinding, Observation } from "./contracts.js";
import type { FakeScript } from "./providers/fake.js";

const SERVICE_FIRST = /dienst|service|formular|antrag|umzug|schalter/i;
const MAX_UNNAMED_CAPTURES_PER_SURFACE = 6;

type Pending =
  | { kind: "name"; key: string; label: string; selectorHint: string; url: string }
  | { kind: "skip"; key: string; href: string; url: string }
  | { kind: "focus"; key: string; label: string; ref: string; url: string };

const surfaceOf = (url: string) => url.split("#")[0]!;

export function exploratoryScript(): FakeScript {
  const inspected = new Set<string>();
  const reported = new Set<string>();
  const activated = new Set<string>();
  const tried = new Set<string>();
  // Normalised surface -> a legal href seen on some earlier observation (the executor accepts any URL discovered in this session).
  const frontier = new Map<string, string>();
  const visited = new Set<string>();
  const capturesPerSurface = new Map<string, number>();
  const refsByKey = new Map<string, string[]>();
  const claims = new Map<string, Omit<CandidateFinding, "observationRefs">>();
  let awaitingEvidence: Pending | null = null;
  let awaitingDialogEscape: { ref: string; label: string; url: string } | null = null;
  let lastEvidenceId: string | null = null;

  return ({ observation: o }) => {
    if (!o) return { action: { type: "unknown", reason: "no observation" } };
    const url = surfaceOf(o.url);
    visited.add(url);
    for (const link of o.legal.navigate) if (!frontier.has(surfaceOf(link))) frontier.set(surfaceOf(link), link);
    const latest = o.evidence[o.evidence.length - 1] ?? null;
    const newestEvidence = latest && latest.id !== lastEvidenceId ? latest : null;
    lastEvidenceId = latest?.id ?? lastEvidenceId;

    // 1. Finalise a claim whose capture_evidence action has just run.
    if (awaitingEvidence && newestEvidence) {
      const pending = awaitingEvidence;
      awaitingEvidence = null;
      refsByKey.set(pending.key, [...(refsByKey.get(pending.key) ?? []), newestEvidence.id]);
      if (!claims.has(pending.key)) claims.set(pending.key, claimFor(pending));
    }

    // 2. After a dialog trigger was activated: Escape, then check where focus went.
    if (awaitingDialogEscape) {
      const trigger = awaitingDialogEscape;
      const wasOpen = o.dialogs.some((dialog) => dialog.visible);
      if (wasOpen) return { action: { type: "escape" }, rationale: "a dialog is open: close it with Escape and check focus return" };
      awaitingDialogEscape = null;
      const key = `focus|${trigger.url}|${trigger.label}`;
      if (!o.focus?.matchesLastActivated && !reported.has(key)) {
        reported.add(key);
        awaitingEvidence = { kind: "focus", key, label: trigger.label, ref: trigger.ref, url: trigger.url };
        return { action: { type: "capture_evidence", targetRef: trigger.ref, note: `focus not returned to ${trigger.label} after Escape closed its dialog` }, rationale: "focus did not return to the trigger" };
      }
    }

    // 3. Inspect each surface once.
    if (!inspected.has(url)) {
      inspected.add(url);
      return { action: { type: "inspect_semantics" }, rationale: "first look at this surface" };
    }

    // 4. Gather evidence for visible naming problems and broken skip links before claiming anything.
    const used = capturesPerSurface.get(url) ?? 0;
    if (used < MAX_UNNAMED_CAPTURES_PER_SURFACE) {
      const broken = o.skipLinks.find((skip) => !skip.targetExists && !reported.has(`skip|${url}|${skip.href}`));
      if (broken) {
        const key = `skip|${url}|${broken.href}`;
        reported.add(key);
        capturesPerSurface.set(url, used + 1);
        awaitingEvidence = { kind: "skip", key, href: broken.href, url };
        return { action: { type: "capture_evidence", targetRef: broken.ref, note: `skip link ${broken.href} has no target on the page` }, rationale: "skip link target is missing" };
      }
      const unnamed = [...o.links, ...o.controls].find((element) => element.visible && !element.hasAccessibleName && !("disabled" in element && element.disabled) && !reported.has(nameKey(url, element.selectorHint)) && !reported.has(`name|*|${componentKey(element.selectorHint)}`));
      if (unnamed) {
        const key = nameKey(url, unnamed.selectorHint);
        reported.add(key);
        capturesPerSurface.set(url, used + 1);
        // Components repeated across pages are consolidated into one claim with several evidence refs.
        const shared = `name|*|${componentKey(unnamed.selectorHint)}`;
        awaitingEvidence = { kind: "name", key: shared, label: describe(unnamed), selectorHint: unnamed.selectorHint, url };
        return { action: { type: "capture_evidence", targetRef: unnamed.ref, note: `no accessible name: ${unnamed.selectorHint}` }, rationale: "visible control without an accessible name" };
      }
    }

    // 5. Menus, disclosures and dialog triggers: activate each safe one once.
    const trigger = o.controls.find((control) => control.visible && control.safeToActivate && (control.expanded !== null || control.controls || control.haspopup) && !activated.has(`${url}|${control.ref}|${control.name}`));
    if (trigger) {
      activated.add(`${url}|${trigger.ref}|${trigger.name}`);
      const opensDialog = trigger.controlsRole === "dialog" || trigger.haspopup === "dialog";
      if (opensDialog) awaitingDialogEscape = { ref: trigger.ref, label: trigger.selectorHint, url };
      return { action: { type: "activate", targetRef: trigger.ref }, rationale: opensDialog ? "dialog trigger" : "menu or disclosure" };
    }

    // 6. Follow unvisited same-origin links, service-like ones first.
    const next = [...frontier.keys()].filter((candidate) => !visited.has(candidate) && !tried.has(candidate));
    next.sort((a, b) => Number(SERVICE_FIRST.test(b)) - Number(SERVICE_FIRST.test(a)));
    const target = next[0];
    if (target && o.budget.stepsLeft > 2) {
      tried.add(target);
      return { action: { type: "navigate", url: frontier.get(target)! }, rationale: "unvisited link" };
    }

    // 7. Nothing new is reachable: stop and hand over candidates.
    const candidates: CandidateFinding[] = [...claims].map(([key, claim]) => ({ ...claim, observationRefs: refsByKey.get(key) ?? [] })).filter((candidate) => candidate.observationRefs.length);
    return { action: { type: "finish", verdict: "complete", summary: `${visited.size} surface(s) inspected, ${candidates.length} candidate(s)`, candidates } };
  };
}

function nameKey(url: string, hint: string) { return `name|${url}|${hint}`; }
// Strip positional parts from a selector hint so the same component on different pages shares one key.
function componentKey(hint: string) { return hint.replace(/:nth-child\(\d+\)/g, ""); }
function describe(element: Observation["links"][number] | Observation["controls"][number]) { return element.selectorHint; }

function claimFor(pending: Pending): Omit<CandidateFinding, "observationRefs"> {
  switch (pending.kind) {
    case "name":
      return {
        category: "missing_accessible_name",
        claim: `${pending.selectorHint} has no accessible name in the DOM-derived accessible-name approximation`,
        reproductionSteps: [`open ${pending.url}`, `inspect ${pending.selectorHint}`],
        limitations: ["DOM summaries approximate the accessible name; not a screen-reader transcript"],
        proposedDeterministicCheck: "flag visible links/controls with no text, aria-label, aria-labelledby, label, alt or title",
      };
    case "skip":
      return {
        category: "skip_link_broken",
        claim: `skip link ${pending.href} points at an element id that does not exist`,
        reproductionSteps: [`open ${pending.url}`, `read skip link ${pending.href}`, "look up its target id"],
        limitations: ["only same-page fragment targets were checked"],
        proposedDeterministicCheck: "skip link fragment must resolve to an existing element, preferably a main landmark",
      };
    case "focus":
      return {
        category: "dialog_focus_not_returned",
        claim: `focus is not returned to ${pending.label} when its dialog is closed with Escape`,
        reproductionSteps: [`open ${pending.url}`, `activate ${pending.label}`, "press Escape", "read document.activeElement"],
        limitations: ["keyboard behaviour observed through DOM state only"],
        proposedDeterministicCheck: "for every aria-haspopup=dialog / aria-controls->dialog trigger: open, Escape, assert focus returns to the trigger",
      };
  }
}
