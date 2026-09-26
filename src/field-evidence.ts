import { z } from "zod";
import type { ProbeResult } from "./contracts.js";

export const FieldEvidenceQualitySchema = z.object({
  schema: z.literal("art/field-evidence-quality/v1"),
  ruleResults: z.object({
    violations: z.number().int().nonnegative(),
    incomplete: z.number().int().nonnegative(),
  }),
  affectedNodes: z.object({
    violations: z.number().int().nonnegative(),
    incomplete: z.number().int().nonnegative(),
  }),
  wcagMappedRuleResults: z.number().int().nonnegative(),
  unmappedRuleResults: z.array(z.string()),
  incompleteRuleIds: z.array(z.string()),
});

export function summarizeFieldEvidenceQuality(results: ProbeResult[]) {
  const relevant = results.filter((result) =>
    result.outcome === "violation" || result.outcome === "incomplete"
  );
  const violations = relevant.filter((result) => result.outcome === "violation");
  const incomplete = relevant.filter((result) => result.outcome === "incomplete");

  return FieldEvidenceQualitySchema.parse({
    schema: "art/field-evidence-quality/v1",
    ruleResults: {
      violations: violations.length,
      incomplete: incomplete.length,
    },
    affectedNodes: {
      violations: violations.reduce((sum, result) => sum + result.nodes.length, 0),
      incomplete: incomplete.reduce((sum, result) => sum + result.nodes.length, 0),
    },
    wcagMappedRuleResults: relevant.filter((result) => result.requirements.length > 0).length,
    unmappedRuleResults: relevant
      .filter((result) => result.requirements.length === 0)
      .map((result) => result.probeId)
      .sort(),
    incompleteRuleIds: incomplete.map((result) => result.probeId).sort(),
  });
}
