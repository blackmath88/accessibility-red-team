import { readFileSync } from "node:fs";
import type { Page } from "playwright";
import { CandidateStatusSchema } from "../learning/contracts.js";
import { skipLinkJourney } from "../journeys/skip-link.js";
import { entryDigest, implementationDigest, ProbeEntrySchema } from "./contracts.js";

export const skipLinkEntry = ProbeEntrySchema.parse({
  schema: "art/probe-entry/v1",
  probeId: "skip-link.same-page",
  implementationVersion: "journeys/0.1+malformed-fragment.1",
  upstreamVersion: null,
  maturity: "candidate",
  originHypothesis: {
    candidateId: "skip-link.same-page.initial",
    sourceType: "journey_gap",
    rationale: "A recognizable same-page skip link may reference a missing target.",
  },
  applicability: "First recognizable link among at most 20 anchors whose href begins with #.",
  assumptions: ["The DOM is settled before inspection.", "Link text identifies intended bypass semantics; target IDs can be resolved in the current document."],
  limitations: [
    "Inspects at most 20 fragment links in DOM order and returns after the first recognizable link.",
    "Uses a bounded link-text set: skip, jump, zum inhalt, zum hauptinhalt, direkt zum (case insensitive).",
    "Does not prove keyboard bypass behaviour or WCAG conformance.",
    "An existing non-main target yields incomplete (abstain).",
    "No recognizable link yields inapplicable (abstain), not proof of absence of a barrier.",
    "Malformed percent-encoded fragments yield incomplete (abstain).",
  ],
  environmentDependencies: ["Playwright Page", "Browser DOM and locator APIs", "Settled document; no shadow-root or frame traversal guarantee"],
  deploymentScope: "Internal shadow observations on settled pages; bounded static challenge evidence only, pending real human review.",
  claimTemplate: "A recognized sampled same-page skip link has no target element with its decoded fragment ID in the inspected document. A pass observes a main-content landmark target only.",
  outcomes: { pass: "no_claim", violation: "claim", incomplete: "abstain", inapplicable: "abstain", error: "abstain" },
  requiredEvidence: ["Recognized link text and href", "Target existence for a claim", "Target tag and role for a pass", "Fresh context per challenge case"],
  upstreamReferences: ["src/journeys/skip-link.ts", "docs/adr/0014-exploration-adjudication-promotion.md"],
  remediationDe: "Das Sprunglink-Ziel muss als eindeutige ID im selben Dokument vorhanden sein. Tastaturbedienung und Fokusführung zusätzlich manuell prüfen.",
  validationRecordRefs: ["docs/catalogue/SKIP_LINK_SAME_PAGE.md#challenge-results"],
  review: null,
});

// Reuse the legacy status vocabulary, but never treat PROMOTED as human approval.
// Source vocabulary is reused directly in ProbeEntry.originHypothesis.sourceType.
export function candidateStatusToMaturity(status: unknown): "experimental" | "candidate" | "retired" {
  switch (CandidateStatusSchema.parse(status)) {
    case "OBSERVED": return "experimental";
    case "CANDIDATE":
    case "VALIDATED":
    case "PROMOTED": return "candidate";
    case "REJECTED":
    case "DEPRECATED": return "retired";
  }
}

export const probeRegistry = [skipLinkEntry] as const;

export function skipLinkDigests() {
  // Hash the actual module source: TypeScript under tsx, emitted JavaScript under node.
  // Reviews are runtime-artifact-specific: recompilation requires a matching review.
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  const source = readFileSync(new URL(`../journeys/skip-link.${extension}`, import.meta.url), "utf8");
  return { entryDigest: entryDigest(skipLinkEntry), implementationDigest: implementationDigest(source) };
}

export async function runSkipLinkProbe(page: Page, surfaceId: string, url: string) {
  const digests = skipLinkDigests();
  const result = await skipLinkJourney(page, surfaceId, url);
  return { result, probeId: skipLinkEntry.probeId, implementationVersion: skipLinkEntry.implementationVersion, ...digests };
}
