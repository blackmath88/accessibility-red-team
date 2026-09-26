import { z } from "zod";

export const CandidateStatusSchema = z.enum([
  "OBSERVED",
  "CANDIDATE",
  "VALIDATED",
  "PROMOTED",
  "REJECTED",
  "DEPRECATED",
]);

export const CandidateCheckSchema = z.object({
  schema: z.literal("art/candidate-check/v1"),
  candidateId: z.string(),
  status: CandidateStatusSchema,
  sourceType: z.enum([
    "repeated_incomplete",
    "repeated_violation_pattern",
    "remediation_pattern",
    "unknown_archetype",
    "journey_gap",
    "manual_observation",
  ]),
  probeId: z.string().nullable(),
  outcome: z.enum(["violation", "incomplete"]).nullable(),
  title: z.string(),
  rationale: z.string(),
  firstObservedAt: z.string().datetime(),
  lastObservedAt: z.string().datetime(),
  municipalityCount: z.number().int().nonnegative(),
  occurrenceCount: z.number().int().nonnegative(),
  municipalities: z.array(z.string()),
  proposedDetector: z.enum([
    "deterministic_rule",
    "safe_journey",
    "manual_review",
    "classifier_rule",
  ]),
  provenanceStatus: z.enum([
    "KNOWN",
    "UNKNOWN",
    "NOT_APPLICABLE",
  ]),
  aiCalls: z.literal(0),
});

export const CandidateCatalogueSchema = z.object({
  schema: z.literal("art/candidate-catalogue/v1"),
  generatedAt: z.string().datetime(),
  sourceCohortId: z.string(),
  candidates: z.array(CandidateCheckSchema),
  aiCalls: z.literal(0),
});

export type CandidateCatalogue = z.infer<typeof CandidateCatalogueSchema>;
