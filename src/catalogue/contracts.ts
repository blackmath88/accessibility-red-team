import { createHash } from "node:crypto";
import { z } from "zod";
import { CandidateCheckSchema } from "../learning/contracts.js";

export const ProbeMaturitySchema = z.enum(["experimental", "candidate", "trusted", "retired"]);
export const GateVerdictSchema = z.enum(["eligible_for_review", "rejected", "insufficient_evidence"]);

export const ReviewerDecisionSchema = z.object({
  reviewerId: z.string().min(1),
  decidedAt: z.string().datetime(),
  decision: z.enum(["approve_trusted", "reject", "needs_changes"]),
  entryDigest: z.string().regex(/^[a-f0-9]{64}$/),
  implementationDigest: z.string().regex(/^[a-f0-9]{64}$/),
  synthetic: z.boolean(),
  note: z.string(),
});

const OutcomeMeaningSchema = z.enum(["claim", "abstain", "no_claim"]);
export const ProbeEntrySchema = z.object({
  schema: z.literal("art/probe-entry/v1"),
  probeId: z.string().min(1),
  implementationVersion: z.string().min(1),
  upstreamVersion: z.string().nullable(),
  maturity: ProbeMaturitySchema,
  originHypothesis: z.object({
    candidateId: z.string(),
    sourceType: CandidateCheckSchema.shape.sourceType,
    rationale: z.string(),
  }),
  applicability: z.string(),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
  environmentDependencies: z.array(z.string()),
  deploymentScope: z.string(),
  claimTemplate: z.string(),
  outcomes: z.object({
    pass: OutcomeMeaningSchema,
    violation: OutcomeMeaningSchema,
    incomplete: OutcomeMeaningSchema,
    inapplicable: OutcomeMeaningSchema,
    error: OutcomeMeaningSchema,
  }),
  requiredEvidence: z.array(z.string()),
  upstreamReferences: z.array(z.string()),
  remediationDe: z.string(),
  validationRecordRefs: z.array(z.string()),
  review: ReviewerDecisionSchema.nullable(),
});

export type ProbeEntry = z.infer<typeof ProbeEntrySchema>;
export type ReviewerDecision = z.infer<typeof ReviewerDecisionSchema>;
export type ProbeDigests = { entryDigest: string; implementationDigest: string };

// Object key order is immaterial; array order remains part of the reviewed claim.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function entryDigest(entry: ProbeEntry): string {
  const { review: _review, maturity: _maturity, ...claim } = ProbeEntrySchema.parse(entry);
  return createHash("sha256").update(canonicalJson(claim)).digest("hex");
}

export function implementationDigest(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex");
}

export function isTrustedEligible(entry: ProbeEntry, currentDigests: ProbeDigests): boolean {
  const review = entry.review;
  return entry.maturity === "trusted"
    && review?.decision === "approve_trusted"
    && review.synthetic === false
    && review.entryDigest === entryDigest(entry)
    && review.entryDigest === currentDigests.entryDigest
    && review.implementationDigest === currentDigests.implementationDigest;
}
