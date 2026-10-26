import { isTrustedEligible, ProbeEntrySchema, type ProbeDigests } from "../catalogue/contracts.js";
import {
  AssessmentResultSchema,
  HumanAdjudicationSchema,
  ProbeExecutionSchema,
  ReproducedObservationSchema,
  evidenceVersion,
  hasValidEvidence,
  reviewDigest,
  type EvidenceRef,
  type PublicationEligibility,
} from "./contracts.js";

export type PublicationInput = {
  record: unknown;
  entry?: unknown;
  currentDigests?: ProbeDigests;
  execution?: unknown;
  observation?: unknown;
  adjudication?: unknown;
  // Trusted caller context, not reviewer identities asserted by the claim/model.
  authorizedReviewerIds: readonly string[];
  authorizedReviewDigests: readonly string[];
  verifiedEvidenceRefs: readonly EvidenceRef[];
  scope: { subjectId: string; obligationId: string; applicable: boolean };
};
export type PublicationDecision = { eligibility: PublicationEligibility; reasons: string[] };
const deny = (...reasons: string[]): PublicationDecision => ({ eligibility: "internal_only", reasons });

export function decidePublication(input: PublicationInput): PublicationDecision {
  const parsed = AssessmentResultSchema.safeParse(input.record);
  if (!parsed.success) return deny("review required", "A raw hypothesis, observation or invalid assessment is not a publishable finding.");
  const assessment = parsed.data;
  if (assessment.outcome !== "violation") return deny(`Outcome ${assessment.outcome} does not establish a finding.`);
  if (!assessment.evidenceRefs.every((ref) => input.verifiedEvidenceRefs.some((verified) => verified.ref === ref.ref && verified.sha256 === ref.sha256))) {
    return deny("Evidence lacks a matching trusted integrity-verification receipt.");
  }
  if (!hasValidEvidence(assessment)) return deny("Missing, unverified or stale claim/evidence provenance.");
  if (!input.scope.applicable || input.scope.subjectId !== assessment.subjectId || input.scope.obligationId !== assessment.obligationId) {
    return deny("Finding is outside the applicable scope.");
  }

  if (assessment.assessment_mode === "automated") {
    const entry = ProbeEntrySchema.safeParse(input.entry);
    if (!entry.success || !input.currentDigests || !isTrustedEligible(entry.data, input.currentDigests)) {
      return deny("review required", "Automatic publication requires a currently approved trusted probe.");
    }
    if (!entry.data.review || !input.authorizedReviewerIds.includes(entry.data.review.reviewerId)
      || !input.authorizedReviewDigests.includes(reviewDigest(entry.data.review))) return deny("Unrecognized probe reviewer authority.");
    if (assessment.probeId !== entry.data.probeId || assessment.implementationVersion !== entry.data.implementationVersion
      || assessment.entryDigest !== input.currentDigests.entryDigest || assessment.implementationDigest !== input.currentDigests.implementationDigest
      || assessment.claim !== entry.data.claimTemplate || entry.data.outcomes.violation !== "claim") return deny("Assessment probe identity, claim semantics or digests do not match the trusted entry.");
    const execution = ProbeExecutionSchema.safeParse(input.execution);
    if (!execution.success) return deny("Missing or invalid immutable probe execution.");
    const run = execution.data;
    if (assessment.verification === "unreviewed" || assessment.author.kind !== "system" || run.author.kind !== "system"
      || run.executionId !== assessment.executionId || run.probeId !== assessment.probeId
      || run.subjectId !== assessment.subjectId || run.obligationId !== assessment.obligationId
      || run.implementationVersion !== assessment.implementationVersion || run.entryDigest !== assessment.entryDigest
      || run.implementationDigest !== assessment.implementationDigest || run.outcome !== assessment.outcome
      || run.executedAt !== assessment.executedAt || JSON.stringify(run.environment) !== JSON.stringify(assessment.environment)
      || run.provenance.status !== "KNOWN" || run.provenance.integrity !== "verified"
      || evidenceVersion(run.evidenceRefs) !== assessment.evidenceVersion) {
      return deny("Execution identity, evidence, provenance or verification does not support automatic publication.");
    }
    return { eligibility: "automatic", reasons: ["Trusted automated violation with matching execution, verified evidence and applicable scope."] };
  }

  // Manual and assisted findings have their own human path, even without an automatable probe.
  const observation = ReproducedObservationSchema.safeParse(input.observation);
  if (!observation.success || !observation.data.freshContext || observation.data.observationId !== assessment.observationId
    || observation.data.subjectId !== assessment.subjectId || observation.data.obligationId !== assessment.obligationId
    || evidenceVersion(observation.data.evidenceRefs) !== assessment.evidenceVersion) {
    return deny("review required", "A matching fresh-context reproduced observation is required.");
  }
  const adjudication = HumanAdjudicationSchema.safeParse(input.adjudication);
  if (!adjudication.success) return deny("review required", "Missing human reviewer authority; model prose is not an adjudication.");
  const review = adjudication.data;
  if (review.synthetic) return deny("Synthetic human-adjudication record cannot authorize publication.");
  if (!input.authorizedReviewerIds.includes(review.reviewerId) || !input.authorizedReviewDigests.includes(reviewDigest(review))) return deny("Unrecognized human reviewer authority.");
  if (review.decision !== "approve_finding" || assessment.verification !== "human_adjudicated") return deny("review required", "Finding is not approved by human adjudication.");
  if (review.assessmentId !== assessment.assessmentId || review.claimVersion !== assessment.claimVersion || review.evidenceVersion !== assessment.evidenceVersion) {
    return deny("Stale adjudication: assessment, claim or evidence version mismatch.");
  }
  return { eligibility: "reviewer_approved", reasons: ["Reproduced manual/assisted barrier approved by an authorized human for these exact claim and evidence versions."] };
}
