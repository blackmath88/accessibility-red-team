import { createHash } from "node:crypto";
import { z } from "zod";
import { JourneyOutcomeSchema } from "../journeys/contracts.js";
import type { ReviewerDecision } from "../catalogue/contracts.js";
import { CandidateCheckSchema } from "../learning/contracts.js";

export const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const IdSchema = z.string().trim().min(1);
export const AuthorSchema = z.strictObject({ kind: z.enum(["human", "model", "system"]), id: IdSchema }).readonly();
export const EvidenceRefSchema = z.strictObject({ ref: IdSchema, sha256: DigestSchema }).readonly();
const EvidenceRefsSchema = z.array(EvidenceRefSchema).readonly();
export const EnvironmentSchema = z.strictObject({
  browserName: IdSchema,
  browserVersion: IdSchema,
  platform: IdSchema,
  probeRuntimeVersion: IdSchema,
}).readonly();
export const ProvenanceSchema = z.strictObject({
  status: CandidateCheckSchema.shape.provenanceStatus,
  integrity: z.enum(["verified", "unverified", "mismatch"]),
  source: IdSchema,
}).readonly();

export const ProbeExecutionSchema = z.strictObject({
  schema: z.literal("art/probe-execution/v1"),
  executionId: IdSchema,
  subjectId: IdSchema,
  obligationId: IdSchema,
  probeId: IdSchema,
  implementationVersion: IdSchema,
  entryDigest: DigestSchema,
  implementationDigest: DigestSchema,
  outcome: JourneyOutcomeSchema,
  evidenceRefs: EvidenceRefsSchema,
  environment: EnvironmentSchema,
  executedAt: z.string().datetime(),
  provenance: ProvenanceSchema,
  author: AuthorSchema,
}).readonly();

export const AssessmentModeSchema = z.enum(["automated", "manual", "assisted"]);
export const VerificationSchema = z.enum(["unreviewed", "replay_verified", "human_adjudicated"]);
export const PublicationEligibilitySchema = z.enum(["internal_only", "reviewer_approved", "automatic"]);
export const AssessmentResultSchema = z.strictObject({
  schema: z.literal("art/assessment-result/v1"),
  assessmentId: IdSchema,
  executionId: IdSchema.nullable(),
  observationId: IdSchema.nullable(),
  subjectId: IdSchema,
  obligationId: IdSchema,
  probeId: IdSchema.nullable(),
  implementationVersion: IdSchema.nullable(),
  entryDigest: DigestSchema.nullable(),
  implementationDigest: DigestSchema.nullable(),
  outcome: JourneyOutcomeSchema,
  claim: IdSchema,
  claimVersion: DigestSchema,
  evidenceVersion: DigestSchema,
  evidenceRefs: EvidenceRefsSchema,
  environment: EnvironmentSchema,
  executedAt: z.string().datetime(),
  provenance: ProvenanceSchema,
  author: AuthorSchema,
  assessment_mode: AssessmentModeSchema,
  verification: VerificationSchema,
  publication_eligibility: PublicationEligibilitySchema,
}).readonly();

export const HypothesisSchema = z.strictObject({
  schema: z.literal("art/hypothesis/v1"),
  hypothesisId: IdSchema,
  source: CandidateCheckSchema.shape.sourceType,
  subjectId: IdSchema,
  obligationId: IdSchema,
  suspectedBarrier: IdSchema,
  falsifyingTest: IdSchema,
  createdAt: z.string().datetime(),
  author: AuthorSchema,
}).readonly();

export const ReproducedObservationSchema = z.strictObject({
  schema: z.literal("art/reproduced-observation/v1"),
  observationId: IdSchema,
  hypothesisId: IdSchema,
  subjectId: IdSchema,
  obligationId: IdSchema,
  contextId: IdSchema,
  freshContext: z.boolean(),
  evidenceRefs: EvidenceRefsSchema,
  observedAt: z.string().datetime(),
  author: AuthorSchema,
}).readonly();

export const HumanAdjudicationSchema = z.strictObject({
  schema: z.literal("art/human-adjudication/v1"),
  adjudicationId: IdSchema,
  assessmentId: IdSchema,
  reviewerId: IdSchema,
  author: z.strictObject({ kind: z.literal("human"), id: IdSchema }).readonly(),
  decidedAt: z.string().datetime(),
  decision: z.enum(["approve_finding", "reject_finding", "needs_changes"]),
  claimVersion: DigestSchema,
  evidenceVersion: DigestSchema,
  synthetic: z.boolean(),
  note: z.string(),
}).refine((record) => record.author.id === record.reviewerId, { message: "Reviewer must be the human author." }).readonly();

export const CaseDispositionSchema = z.enum(["open", "unresolved", "resolved", "not_retested", "non_comparable"]);
export const FindingCaseSchema = z.strictObject({
  schema: z.literal("art/finding-case/v1"),
  caseId: IdSchema,
  subjectId: IdSchema,
  obligationId: IdSchema,
  probeId: IdSchema.nullable(),
  implementationVersion: IdSchema.nullable(),
  assessmentIds: z.array(IdSchema).readonly(),
  adjudicationIds: z.array(IdSchema).readonly(),
  retestIds: z.array(IdSchema).readonly(),
  disposition: CaseDispositionSchema,
}).readonly();

export const CaseRetestSchema = z.strictObject({
  schema: z.literal("art/case-retest/v1"),
  retestId: IdSchema,
  execution_status: z.enum(["completed", "skipped", "blocked"]),
  assessment: AssessmentResultSchema.nullable(),
}).readonly();

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type ProbeExecution = z.infer<typeof ProbeExecutionSchema>;
export type AssessmentResult = z.infer<typeof AssessmentResultSchema>;
export type Hypothesis = z.infer<typeof HypothesisSchema>;
export type ReproducedObservation = z.infer<typeof ReproducedObservationSchema>;
export type HumanAdjudication = z.infer<typeof HumanAdjudicationSchema>;
export type FindingCase = z.infer<typeof FindingCaseSchema>;
export type CaseRetest = z.infer<typeof CaseRetestSchema>;
export type PublicationEligibility = z.infer<typeof PublicationEligibilitySchema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function evidenceVersion(refs: readonly EvidenceRef[]): string {
  return digest(refs);
}
export function claimVersion(assessment: Pick<AssessmentResult,
  "assessmentId" | "subjectId" | "obligationId" | "probeId" | "implementationVersion" | "entryDigest" | "implementationDigest" | "outcome" | "claim"
>): string {
  const { assessmentId, subjectId, obligationId, probeId, implementationVersion, entryDigest, implementationDigest, outcome, claim } = assessment;
  return digest({ assessmentId, subjectId, obligationId, probeId, implementationVersion, entryDigest, implementationDigest, outcome, claim });
}

export function hasValidEvidence(assessment: AssessmentResult): boolean {
  return assessment.evidenceRefs.length > 0
    && new Set(assessment.evidenceRefs.map((ref) => ref.ref)).size === assessment.evidenceRefs.length
    && assessment.provenance.status === "KNOWN"
    && assessment.provenance.integrity === "verified"
    && assessment.evidenceVersion === evidenceVersion(assessment.evidenceRefs)
    && assessment.claimVersion === claimVersion(assessment);
}

// Trusted review-store receipts bind the complete record, including author and synthetic flag.
export function reviewDigest(review: HumanAdjudication | ReviewerDecision): string {
  return digest(review);
}
