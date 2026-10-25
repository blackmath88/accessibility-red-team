import { FindingCaseSchema, hasValidEvidence, type CaseRetest, type FindingCase } from "./contracts.js";

export type VersionCompatibility = Readonly<{ from: string; to: string }>;

// Explicit compatibility pairs are trusted policy configuration, never inferred from semver.
export function resolveCase(
  findingCase: FindingCase,
  retest: CaseRetest | null,
  compatibleVersions: readonly VersionCompatibility[] = [],
): FindingCase {
  let disposition: FindingCase["disposition"] = "not_retested";
  const assessment = retest?.assessment;
  if (retest?.execution_status === "completed" && assessment) {
    const sameVersion = findingCase.implementationVersion === assessment.implementationVersion
      || compatibleVersions.some((pair) => pair.from === findingCase.implementationVersion && pair.to === assessment.implementationVersion);
    if (!findingCase.probeId || !findingCase.implementationVersion
      || findingCase.subjectId !== assessment.subjectId || findingCase.obligationId !== assessment.obligationId
      || findingCase.probeId !== assessment.probeId || !sameVersion) {
      disposition = "non_comparable";
    } else {
      const verifiedToolRetest = assessment.assessment_mode === "automated" && assessment.author.kind === "system"
        && assessment.verification !== "unreviewed" && assessment.executionId !== null;
      disposition = assessment.outcome === "pass" && verifiedToolRetest && hasValidEvidence(assessment) ? "resolved" : "unresolved";
    }
  }
  return FindingCaseSchema.parse({
    ...findingCase,
    disposition,
    assessmentIds: assessment && retest?.execution_status === "completed"
      ? [...new Set([...findingCase.assessmentIds, assessment.assessmentId])] : findingCase.assessmentIds,
    retestIds: retest ? [...new Set([...findingCase.retestIds, retest.retestId])] : findingCase.retestIds,
  });
}
