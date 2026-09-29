import { z } from "zod";

export const SemanticExperimentInputSchema = z.object({
  schema: z.literal("art/semantic-experiment-input/v1"),
  experimentId: z.string(),
  findingId: z.string(),
  criterion: z.string(),
  evidence: z.array(z.object({
    kind: z.string(),
    value: z.string(),
    sourceRef: z.string(),
  })).min(1),
  decisionSpace: z.array(z.string()).min(2),
  instruction: z.string(),
});

export const SemanticExperimentOutputSchema = z.object({
  schema: z.literal("art/semantic-experiment-output/v1"),
  experimentId: z.string(),
  findingId: z.string(),
  model: z.string(),
  decision: z.string(),
  rationale: z.string().max(1000),
  evidenceRefs: z.array(z.string()),
  requiresHumanReview: z.boolean(),
  latencyMs: z.number().int().nonnegative().optional(),
});

export type SemanticExperimentInput = z.infer<typeof SemanticExperimentInputSchema>;
export type SemanticExperimentOutput = z.infer<typeof SemanticExperimentOutputSchema>;

export function validateSemanticDecision(input: SemanticExperimentInput, output: SemanticExperimentOutput) {
  if (input.experimentId !== output.experimentId || input.findingId !== output.findingId) throw new Error("Semantic output identity mismatch");
  if (!output.requiresHumanReview && !input.decisionSpace.includes(output.decision)) throw new Error("Decision outside bounded decision space");
  const allowedRefs = new Set(input.evidence.map((e) => e.sourceRef));
  if (output.evidenceRefs.some((ref) => !allowedRefs.has(ref))) throw new Error("Semantic output cited evidence not supplied to model");
  return output;
}
