// Observer role: reads two SEALED arms (traces + evidence) and emits hypotheses only. It never accepts a finding, never
// produces a patch, and never changes either arm. This v1 observer is a deterministic rule set (no model call); the rules were
// written against the development fixtures only. Hypotheses are inputs to human review and to fixture/regression work.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { readArm, type ArmSummary } from "./arms.js";
import { ObservationSchema, type Observation } from "./contracts.js";

export const OBSERVER_VERSION = "observer-rules/v1";

export const HypothesisKindSchema = z.enum(["suspicious_classification", "missing_coverage", "detector_error", "candidate_regression_check"]);

// Strict on purpose: there is no field through which a hypothesis could carry an accepted finding or an executable patch.
export const HypothesisSchema = z.strictObject({
  id: z.string(),
  kind: HypothesisKindSchema,
  statement: z.string(),
  confidence: z.enum(["low", "medium"]),
  evidenceRefs: z.array(z.strictObject({ arm: z.enum(["A", "B"]), file: z.string(), pointer: z.string() })).min(1),
  suggestedFixtureOrCheck: z.string().nullable(),
  relatedTo: z.string().nullable(),
  status: z.literal("hypothesis"),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const ObserverReportSchema = z.strictObject({
  schema: z.literal("art/adaptive-observer/v1"),
  observer: z.literal(OBSERVER_VERSION),
  modelCalls: z.literal(0),
  fixture: z.string(),
  inputs: z.strictObject({ A: z.string(), B: z.string() }),
  hypotheses: z.array(HypothesisSchema),
});
export type ObserverReport = z.infer<typeof ObserverReportSchema>;

type Trace = { step: number; action: { type?: string; targetRef?: string } | null; outcome: string; detail: string };

async function jsonl<T>(path: string): Promise<T[]> {
  return (await readFile(path, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

const pathOf = (url: string) => { try { return new URL(url).pathname; } catch { return url; } };

export async function observe(dirA: string, dirB: string): Promise<ObserverReport> {
  const [a, b] = await Promise.all([readArm(dirA), readArm(dirB)]);
  const observations = (await jsonl<unknown>(join(dirB, "session", "observations.jsonl"))).map((line) => ObservationSchema.parse(line));
  const trace = await jsonl<Trace>(join(dirB, "session", "trace.jsonl"));
  const hypotheses: Hypothesis[] = [];
  const add = (hypothesis: Omit<Hypothesis, "id" | "status" | "relatedTo"> & { relatedTo?: string | null }): string => {
    const id = `h${hypotheses.length + 1}`;
    hypotheses.push({ relatedTo: null, ...hypothesis, id, status: "hypothesis" });
    return id;
  };

  detectorErrors(a.summary, observations, add);
  surfaceCoverage(a.summary, b.summary, observations, trace, add);
  classification(a.summary, add);
  findingCoverage(a.summary, b.summary, add);
  stateCoverage(a.summary, b.summary, add);

  return ObserverReportSchema.parse({ schema: "art/adaptive-observer/v1", observer: OBSERVER_VERSION, modelCalls: 0, fixture: a.summary.fixture, inputs: { A: a.seal.rootSha256, B: b.seal.rootSha256 }, hypotheses });
}

type Add = (hypothesis: Omit<Hypothesis, "id" | "status" | "relatedTo"> & { relatedTo?: string | null }) => string;

// A "dialog" journey that reports it activated a dialog-like trigger and found no dialog, while B's observation shows that trigger
// controls something that is not a dialog (a menu or navigation landmark): the detector probably tested the wrong control.
function detectorErrors(a: ArmSummary, observations: Observation[], add: Add): void {
  for (const journey of a.journeys) {
    for (const result of journey.results as Array<{ kind?: string; outcome?: string; evidence?: Array<{ action?: string; before?: { id?: string | null }; after?: { ariaControls?: string | null; ariaHaspopup?: string | null } }> }>) {
      const first = result.evidence?.[0];
      if (result.kind !== "dialog" || result.outcome !== "incomplete" || first?.action !== "Enter on dialog-like trigger" || !first.before?.id) continue;
      const triggerId = first.before.id;
      const index = observations.findIndex((observation) => pathOf(observation.url) === journey.path && observation.controls.some((control) => control.id === triggerId));
      const control = index >= 0 ? observations[index]!.controls.find((candidate) => candidate.id === triggerId) : undefined;
      if (!control || !control.controls || control.controlsRole === "dialog" || control.haspopup === "dialog") continue;
      const detector = add({
        kind: "detector_error",
        statement: `The dialog journey on ${journey.path} treated #${triggerId} (aria-controls="${control.controls}") as a dialog trigger, but B observed that it controls a <${control.controlsRole ?? "missing element"}>, not a dialog. The journey's "incomplete" outcome probably says nothing about any real dialog on this page.`,
        confidence: "medium",
        evidenceRefs: [
          { arm: "A", file: "arm.json", pointer: `journeys[path=${journey.path}].results[kind=dialog].evidence[0]` },
          { arm: "B", file: "session/observations.jsonl", pointer: `line ${index + 1}: controls[id=${triggerId}]` },
        ],
        suggestedFixtureOrCheck: "fixture with a menu toggle (aria-controls to nav) placed before a real dialog trigger",
      });
      add({
        kind: "candidate_regression_check",
        statement: "Classify every aria-haspopup/aria-controls trigger by the role of the element it controls before choosing which triggers the dialog journey exercises; menu disclosures must not be reported as dialog failures, and every dialog trigger should be exercised.",
        confidence: "medium",
        evidenceRefs: [{ arm: "A", file: "arm.json", pointer: `journeys[path=${journey.path}].results[kind=dialog]` }],
        suggestedFixtureOrCheck: "aria-controls-target-role",
        relatedTo: detector,
      });
    }
  }
}

// Surfaces B reached that A did not, with the reason when the trace shows the link only appeared after an activation.
function surfaceCoverage(a: ArmSummary, b: ArmSummary, observations: Observation[], trace: Trace[], add: Add): void {
  const aPaths = new Set(a.surfaces.map((surface) => surface.path));
  for (const surface of b.surfaces.filter((candidate) => !aPaths.has(candidate.path))) {
    const first = observations.findIndex((observation) => observation.links.some((link) => pathOf(link.href) === surface.path));
    const revealedBy = first > 0 && trace[first - 1]?.action?.type === "activate" ? trace[first - 1]! : null;
    add({
      kind: "missing_coverage",
      statement: revealedBy
        ? `${surface.path} was reached by B but never visited by A. Its link first appeared in B's observation after step ${revealedBy.step} (${revealedBy.detail}); A's static discovery only sees links present before any interaction.`
        : `${surface.path} was reached by B but never visited by A (A's sampling or discovery did not select it).`,
      confidence: revealedBy ? "medium" : "low",
      evidenceRefs: [{ arm: "B", file: "session/trace.jsonl", pointer: revealedBy ? `step ${revealedBy.step}` : `navigate to ${surface.path}` }],
      suggestedFixtureOrCheck: revealedBy ? "journey that opens disclosure menus and re-collects links before sampling surfaces" : null,
    });
  }
}

// A page classified as a service/form purely from words in its URL, though it is a dated post without any substantive form field.
function classification(a: ArmSummary, add: Add): void {
  for (const surface of a.surfaces) {
    if ((surface.kind === "service" || surface.kind === "form") && /\d{4}-\d{2}-\d{2}/.test(surface.path) && surface.substantiveFormFields === 0) {
      add({
        kind: "suspicious_classification",
        statement: `A classified dated post ${surface.path} as "${surface.kind}" (${surface.classificationReason}), but the page has no substantive form fields. The classification probably came from a word in the URL path.`,
        confidence: "medium",
        evidenceRefs: [{ arm: "A", file: "arm.json", pointer: `surfaces[path=${surface.path}]` }],
        suggestedFixtureOrCheck: "classifier fixture: dated news path under a /service-like segment",
      });
    }
  }
}

// B findings with no counterpart in A, and component defects B saw on more pages than A sampled.
function findingCoverage(a: ArmSummary, b: ArmSummary, add: Add): void {
  for (const finding of b.findings) {
    const aPaths = new Set(a.findings.filter((candidate) => candidate.category === finding.category).flatMap((candidate) => candidate.occurrences.map((occurrence) => occurrence.path)));
    const bPaths = [...new Set(finding.occurrences.map((occurrence) => occurrence.path))];
    const missing = bPaths.filter((path) => !aPaths.has(path));
    if (!missing.length) continue;
    const probes = a.journeys.flatMap((journey) => journey.results.map((result) => `${(result as { journeyId?: string }).journeyId}:${(result as { outcome?: string }).outcome}`));
    add({
      kind: "missing_coverage",
      statement: `B reported ${finding.category} on ${missing.join(", ")}; A reported nothing of that category there. A's closest probes: ${probes.length ? probes.join(", ") : "none"}.`,
      confidence: "low",
      evidenceRefs: [{ arm: "B", file: "arm.json", pointer: `findings[id=${finding.id}]` }],
      suggestedFixtureOrCheck: `deterministic check for ${finding.category}`,
    });
  }
}

function stateCoverage(a: ArmSummary, b: ArmSummary, add: Add): void {
  const bStates = b.states.filter((state) => /expanded=\[[^\]]+\]|dialogs=[1-9]/.test(state));
  if (!bStates.length || a.states.some((state) => !state.endsWith("#initial"))) return;
  add({
    kind: "missing_coverage",
    statement: `A recorded only initial page states; B observed ${bStates.length} interaction state(s) (open menu or dialog).`,
    confidence: "low",
    evidenceRefs: [{ arm: "B", file: "arm.json", pointer: "states" }],
    suggestedFixtureOrCheck: null,
  });
}
