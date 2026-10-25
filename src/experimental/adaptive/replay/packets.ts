import { createHash } from "node:crypto";
import { z } from "zod";
import type { ModelMessage } from "../provider.js";

export const POINTS = ["missed_sibling", "dialog_focus"] as const;
export const VARIANTS = ["original", "frontier_visible", "restructured_evidence"] as const;
export const PointSchema = z.enum(POINTS);
export const VariantSchema = z.enum(VARIANTS);
export type Point = z.infer<typeof PointSchema>;
export type Variant = z.infer<typeof VariantSchema>;

// These are invented observations, not an extraction or reconstruction of trial 3.
export const FACTS: Record<Point, readonly string[]> = {
  missed_sibling: [
    "At step 0, /s/a.html and /s/b.html were discovered on /index.html and offered for navigation.",
    "The current page is /s/a.html; only this sibling has been inspected (ev_1).",
    "The observed skip link on /s/a.html has an existing main target.",
    "/s/b.html has not been visited or probed. Its page content and skip-link behavior are unknown.",
    "Both discovered URLs remain allowed; two surfaces and four calls remain.",
  ],
  dialog_focus: [
    "On /panel.html, button#help (ref e2) controls a role=dialog element.",
    "Activation ev_1 opened the dialog and focus moved inside it.",
    "Escape ev_2 closed the dialog; focus is on body and matchesLastActivated is false.",
    "No subsequent focus movement or fresh reproduction has been recorded.",
    "Capturing evidence and activating e2 remain allowed; two calls remain.",
  ],
};
const SYSTEM = "Synthetic local accessibility decision smoke. Choose one next action and interpret only the supplied evidence. Return JSON {action: {type, ...}, interpretation: string, rationale?: string}. Use an adaptive harness action (navigate, capture_evidence, inspect_semantics, activate, escape, or finish with verdict and summary). Interpretation vocabulary: sibling_unobserved, focus_return_not_observed, insufficient_evidence, no_issue_observed. These are response labels, not findings or beliefs. Do not infer observations on unvisited pages or claim conformance.";
export const TRANSFORMATIONS: Record<Variant, string> = {
  original: "List the synthetic observations in chronological order; original means synthetic baseline, never historical original.",
  frontier_visible: "Keep all observations verbatim and append a harness bookkeeping projection derived only from those observations.",
  restructured_evidence: "Keep every observation verbatim, reverse display order, and give each a stable fact index; add no observation or adjudication.",
};

export function packetMessages(point: Point, variant: Variant): ModelMessage[] {
  const facts = FACTS[point];
  const observations = variant === "restructured_evidence"
    ? [...facts.entries()].reverse().map(([index, fact]) => ({ factIndex: index, fact }))
    : [...facts];
  const frontier = point === "missed_sibling"
    ? { pages: [{ url: "/s/a.html", visited: true, inspectionRecorded: true }, { url: "/s/b.html", visited: false, inspectionRecorded: false }] }
    : { execution_status: "executed", evidenceIds: ["ev_1", "ev_2"], assessment_outcome: "unassessed", follow_up_required: true };
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: JSON.stringify({ provenance: "synthetic_local_smoke", point, observations, ...(variant === "frontier_visible" ? { frontier } : {}) }) },
  ];
}

// Hash the exact ordered role/content pairs sent to complete(), including the system instruction.
export const packetHash = (messages: ModelMessage[]) => createHash("sha256").update(JSON.stringify(messages)).digest("hex");
