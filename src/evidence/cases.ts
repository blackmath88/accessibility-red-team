import { z } from "zod";
import {
  DigestSchema, FindingCaseSchema, ProbeExecutionSchema, evidenceVersion, hasValidEvidence,
  type CaseRetest, type EvidenceRef, type FindingCase,
} from "./contracts.js";

const CaseIdentitySchema = z.strictObject({
  probeId: z.string().trim().min(1),
  implementationVersion: z.string().trim().min(1),
  entryDigest: DigestSchema,
  implementationDigest: DigestSchema,
  claimVersion: DigestSchema,
}).readonly();
export const VersionCompatibilitySchema = z.strictObject({
  from: CaseIdentitySchema,
  to: CaseIdentitySchema,
  reviewerId: z.string().trim().min(1),
  decidedAt: z.string().datetime(),
  synthetic: z.literal(false),
  note: z.string().trim().min(1),
}).readonly();
export type VersionCompatibility = z.infer<typeof VersionCompatibilitySchema>;
export type CaseResolutionContext = {
  execution?: unknown;
  // Trusted integrity-service receipts and reviewed policy, never retest/model assertions.
  verifiedEvidenceRefs?: readonly EvidenceRef[];
  compatibleVersions?: readonly VersionCompatibility[];
};

function identityMatches(left: FindingCase | VersionCompatibility["from"], right: FindingCase | VersionCompatibility["to"]) {
  return left.probeId === right.probeId && left.implementationVersion === right.implementationVersion
    && left.entryDigest === right.entryDigest && left.implementationDigest === right.implementationDigest
    && left.claimVersion === right.claimVersion;
}

// Compatibility records are trusted caller policy; no compatibility is inferred from semver.
export function resolveCase(
  findingCase: FindingCase,
  retest: CaseRetest | null,
  context: CaseResolutionContext = {},
): FindingCase {
  let disposition: FindingCase["disposition"] = "not_retested";
  const reasons: string[] = ["No completed retest assessment."];
  const assessment = retest?.assessment;
  if (retest?.execution_status === "completed" && assessment) {
    reasons.length = 0;
    const identity = CaseIdentitySchema.safeParse({
      probeId: assessment.probeId, implementationVersion: assessment.implementationVersion,
      entryDigest: assessment.entryDigest, implementationDigest: assessment.implementationDigest,
      claimVersion: assessment.claimVersion,
    });
    const comparableIdentity = identity.success && (identityMatches(findingCase, identity.data)
      || (context.compatibleVersions ?? []).some((record) => {
        const parsed = VersionCompatibilitySchema.safeParse(record);
        return parsed.success && identityMatches(findingCase, parsed.data.from) && identityMatches(identity.data, parsed.data.to);
      }));
    if (!findingCase.probeId || !findingCase.implementationVersion || !findingCase.entryDigest || !findingCase.implementationDigest
      || findingCase.subjectId !== assessment.subjectId || findingCase.obligationId !== assessment.obligationId || !comparableIdentity) {
      disposition = "non_comparable";
      reasons.push("Subject, obligation, probe, entry/implementation digest or claim version differs without reviewed compatibility.");
    } else {
      const execution = ProbeExecutionSchema.safeParse(context.execution);
      const run = execution.success ? execution.data : null;
      if (!run || run.author.kind !== "system" || run.executionId !== assessment.executionId
        || run.probeId !== assessment.probeId || run.subjectId !== assessment.subjectId || run.obligationId !== assessment.obligationId
        || run.implementationVersion !== assessment.implementationVersion || run.entryDigest !== assessment.entryDigest
        || run.implementationDigest !== assessment.implementationDigest || run.outcome !== assessment.outcome
        || run.executedAt !== assessment.executedAt || JSON.stringify(run.environment) !== JSON.stringify(assessment.environment)
        || run.provenance.status !== "KNOWN" || run.provenance.integrity !== "verified"
        || evidenceVersion(run.evidenceRefs) !== assessment.evidenceVersion) {
        reasons.push("Missing or mismatched immutable probe execution.");
      }
      if (!assessment.evidenceRefs.every((ref) => (context.verifiedEvidenceRefs ?? []).some((verified) => verified.ref === ref.ref && verified.sha256 === ref.sha256))) {
        reasons.push("Evidence lacks a matching trusted integrity-verification receipt.");
      }
      if (assessment.assessment_mode !== "automated" || assessment.author.kind !== "system"
        || assessment.verification === "unreviewed" || !hasValidEvidence(assessment)) {
        reasons.push("Retest is not a verified system assessment with valid claim/evidence provenance.");
      }
      if (assessment.outcome !== "pass") reasons.push(`Outcome ${assessment.outcome} does not resolve the case.`);
      disposition = reasons.length ? "unresolved" : "resolved";
      if (disposition === "resolved") reasons.push("Comparable pass supported by a matching execution and trusted evidence receipts.");
    }
  }
  return FindingCaseSchema.parse({
    ...findingCase,
    disposition,
    resolutionReasons: reasons,
    assessmentIds: assessment && retest?.execution_status === "completed"
      ? [...new Set([...findingCase.assessmentIds, assessment.assessmentId])] : findingCase.assessmentIds,
    retestIds: retest ? [...new Set([...findingCase.retestIds, retest.retestId])] : findingCase.retestIds,
  });
}
