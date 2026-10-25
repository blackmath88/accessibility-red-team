// A proposed deterministic check, produced from an observer hypothesis and validated on fixtures. It is NOT wired into the
// production scanner and nothing here promotes it: promotion needs human review and a separate, versioned scanner change.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ObservationSchema } from "./contracts.js";
import { readArm } from "./arms.js";
import { observe } from "./observer.js";
import { loadTruth, type FixtureName, type Truth } from "../../../test/fixtures/adaptive-sites/server.js";

export const CHECK_ID = "aria-controls-target-role";
export type TriggerClass = "dialog_trigger" | "disclosure_menu" | "unknown_target" | "not_applicable";

export type TriggerFacts = { controls: string | null; controlsRole: string | null; haspopup: string | null };

// Decide what an aria-controls / aria-haspopup trigger actually opens, from the role of the controlled element.
export function classifyTrigger(facts: TriggerFacts): TriggerClass {
  if (facts.haspopup === "dialog") return "dialog_trigger";
  if (!facts.controls) return "not_applicable";
  if (facts.controlsRole === null) return "unknown_target";
  return facts.controlsRole === "dialog" || facts.controlsRole === "alertdialog" ? "dialog_trigger" : "disclosure_menu";
}

export type CandidateValidation = {
  schema: "art/adaptive-candidate-validation/v1";
  check: typeof CHECK_ID;
  hypothesisIds: string[];
  status: "validated_not_promoted" | "not_reproduced" | "regression_failed";
  promoted: false;
  promotionRequires: string;
  reproduction: { fixture: string; reproduced: boolean; detail: string; wrongTrigger: string | null; selectedByCheck: string[] };
  regression: { fixture: string; cases: Array<{ control: string; expected: string; actual: string; ok: boolean }>; passed: boolean };
  heldOut: null | { fixture: string; cases: Array<{ control: string; expected: string; actual: string; ok: boolean }>; passed: boolean; observerDetectorErrorFired: boolean; observerMissingCoverageFired: boolean; baselineDialogOutcome: string | null; note: string };
};

async function classes(armDir: string, truth: Truth) {
  const first = ObservationSchema.parse(JSON.parse((await readFile(join(armDir, "session", "observations.jsonl"), "utf8")).split("\n")[0]!));
  const cases = Object.entries(truth.controls ?? {}).map(([control, expected]) => {
    const element = first.controls.find((candidate) => candidate.id === control);
    const actual = element ? classifyTrigger(element) : "not_applicable";
    return { control, expected, actual, ok: actual === expected };
  });
  return { first, cases };
}

// Reproduce on the development fixture, check the proposed rule against fixture truth, then report the held-out variation unchanged.
export async function validateCandidate(input: { dev: { fixture: FixtureName; A: string; B: string }; heldOut?: { fixture: FixtureName; A: string; B: string } }): Promise<CandidateValidation> {
  const devTruth = await loadTruth(input.dev.fixture);
  const report = await observe(input.dev.A, input.dev.B);
  const detector = report.hypotheses.find((hypothesis) => hypothesis.kind === "detector_error");
  const check = report.hypotheses.find((hypothesis) => hypothesis.kind === "candidate_regression_check");
  const a = (await readArm(input.dev.A, "A")).summary;
  const dialog = a.journeys.flatMap((journey) => journey.results).find((result) => (result as { kind?: string }).kind === "dialog") as { outcome?: string; evidence?: Array<{ before?: { id?: string } }> } | undefined;
  const wrongTrigger = dialog?.evidence?.[0]?.before?.id ?? null;
  const dev = await classes(input.dev.B, devTruth);
  const selected = dev.first.controls.filter((control) => classifyTrigger(control) === "dialog_trigger").map((control) => control.id ?? control.ref);
  const reproduced = Boolean(detector && wrongTrigger && dev.cases.find((entry) => entry.control === wrongTrigger)?.expected === "disclosure_menu" && !selected.includes(wrongTrigger));
  const regressionPassed = dev.cases.length > 0 && dev.cases.every((entry) => entry.ok);

  let heldOut: CandidateValidation["heldOut"] = null;
  if (input.heldOut) {
    const truth = await loadTruth(input.heldOut.fixture);
    const held = await classes(input.heldOut.B, truth);
    const heldReport = await observe(input.heldOut.A, input.heldOut.B);
    const heldA = (await readArm(input.heldOut.A, "A")).summary;
    const heldDialog = heldA.journeys.flatMap((journey) => journey.results).find((result) => (result as { kind?: string }).kind === "dialog") as { outcome?: string } | undefined;
    heldOut = {
      fixture: input.heldOut.fixture, cases: held.cases, passed: held.cases.every((entry) => entry.ok),
      observerDetectorErrorFired: heldReport.hypotheses.some((hypothesis) => hypothesis.kind === "detector_error"),
      observerMissingCoverageFired: heldReport.hypotheses.some((hypothesis) => hypothesis.kind === "missing_coverage"),
      baselineDialogOutcome: heldDialog?.outcome ?? null,
      note: "Reported as observed; the held-out layout was not used to tune the observer rules or the check.",
    };
  }

  return {
    schema: "art/adaptive-candidate-validation/v1", check: CHECK_ID, hypothesisIds: [detector?.id, check?.id].filter((id): id is string => Boolean(id)),
    status: !reproduced ? "not_reproduced" : !regressionPassed ? "regression_failed" : "validated_not_promoted",
    promoted: false,
    promotionRequires: "human review of the check, a versioned scanner change with its own regression suite, and a new run segment; none of that is performed here",
    reproduction: {
      fixture: input.dev.fixture, reproduced, wrongTrigger, selectedByCheck: selected,
      detail: reproduced
        ? `The baseline dialog journey exercised #${wrongTrigger} (a ${dev.cases.find((entry) => entry.control === wrongTrigger)?.actual}) and reported "${dialog?.outcome}"; the proposed check selects ${selected.map((id) => `#${id}`).join(", ")} instead.`
        : "The observer did not produce a detector_error hypothesis for this pair, or the check agreed with the baseline's choice.",
    },
    regression: { fixture: input.dev.fixture, cases: dev.cases, passed: regressionPassed },
    heldOut,
  };
}
