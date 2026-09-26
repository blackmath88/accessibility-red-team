import { z } from "zod";
import type { RequirementCapability } from "./capability.js";

export const CoverageObservationStatusSchema = z.enum([
  "NOT_OBSERVED",
  "OBSERVED",
  "PARTIALLY_OBSERVED",
  "HUMAN_REVIEW_REMAINS",
]);

export const RunRequirementCoverageSchema = z.object({
  schema: z.literal("art/run-requirement-coverage/v1"),
  framework: z.literal("WCAG"),
  criterion: z.string(),
  status: CoverageObservationStatusSchema,
  observedModes: z.array(z.enum(["DETERMINISTIC", "BEHAVIORAL", "SEMANTIC"])),
  humanReviewRequired: z.boolean(),
  evidenceRefs: z.array(z.string()),
});

export type RunRequirementCoverage = z.infer<typeof RunRequirementCoverageSchema>;

export type CapabilityEvidenceLike = {
  criterion: string;
  mode: "DETERMINISTIC" | "BEHAVIORAL" | "SEMANTIC";
  evidenceRef: string;
};

export function summarizeRunCoverage(
  capabilities: RequirementCapability[],
  evidence: CapabilityEvidenceLike[],
): RunRequirementCoverage[] {
  return capabilities.map((capability) => {
    const matching = evidence.filter((item) => item.criterion === capability.criterion);
    const observedModes = Array.from(new Set(matching.map((item) => item.mode))).sort();
    const evidenceRefs = Array.from(new Set(matching.map((item) => item.evidenceRef))).sort();

    let status: RunRequirementCoverage["status"] = "NOT_OBSERVED";
    if (matching.length > 0) {
      status = capability.humanReview
        ? "HUMAN_REVIEW_REMAINS"
        : "OBSERVED";
    }

    return RunRequirementCoverageSchema.parse({
      schema: "art/run-requirement-coverage/v1",
      framework: "WCAG",
      criterion: capability.criterion,
      status,
      observedModes,
      humanReviewRequired: capability.humanReview,
      evidenceRefs,
    });
  });
}
