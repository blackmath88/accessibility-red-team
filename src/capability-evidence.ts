import { z } from "zod";
import type { JourneyRun } from "./journeys/contracts.js";

export const ObservedCapabilityEvidenceSchema = z.object({
  schema: z.literal("art/observed-capability-evidence/v1"),
  framework: z.literal("WCAG"),
  criterion: z.string(),
  mode: z.enum(["BEHAVIORAL"]),
  producerId: z.string(),
  producerVersion: z.string(),
  outcome: z.enum(["pass", "violation", "incomplete", "inapplicable", "error"]),
  surfaceId: z.string(),
  evidenceCount: z.number().int().nonnegative(),
});

export type ObservedCapabilityEvidence = z.infer<typeof ObservedCapabilityEvidenceSchema>;

const JOURNEY_REQUIREMENTS: Record<string, string[]> = {
  keyboard_focus: ["2.4.3"],
};

export function capabilityEvidenceFromJourneyRuns(runs: JourneyRun[]): ObservedCapabilityEvidence[] {
  return runs.flatMap((run) =>
    run.results.flatMap((result) =>
      (JOURNEY_REQUIREMENTS[result.kind] ?? []).map((criterion) =>
        ObservedCapabilityEvidenceSchema.parse({
          schema: "art/observed-capability-evidence/v1",
          framework: "WCAG",
          criterion,
          mode: "BEHAVIORAL",
          producerId: result.journeyId,
          producerVersion: result.journeyVersion,
          outcome: result.outcome,
          surfaceId: result.surfaceId,
          evidenceCount: result.evidence.length,
        }),
      ),
    ),
  );
}
