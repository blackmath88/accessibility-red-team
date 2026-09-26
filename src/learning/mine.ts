import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { CohortResultSchema } from "../cohort/contracts.js";
import { CandidateCatalogueSchema } from "./contracts.js";

function candidateId(kind: string, id: string, outcome: string): string {
  return "candidate_" + createHash("sha256")
    .update(`${kind}:${id}:${outcome}`)
    .digest("hex")
    .slice(0, 12);
}

function titleFor(probeId: string, outcome: string): string {
  const readable = probeId.replace(/^axe\./, "").replaceAll("-", " ");
  return outcome === "incomplete"
    ? `Resolve repeated ${readable} review gap`
    : `Investigate repeated ${readable} remediation pattern`;
}

export async function mineCandidates(options: {
  cohortSummaryPath: string;
  outPath: string;
  minMunicipalities?: number;
  minOccurrences?: number;
}) {
  const raw = JSON.parse(await readFile(options.cohortSummaryPath, "utf8"));
  const cohort = CohortResultSchema.parse(raw);
  const minMunicipalities = options.minMunicipalities ?? 2;
  const minOccurrences = options.minOccurrences ?? 3;
  const now = new Date().toISOString();

  const issueCandidates = cohort.issueFamilies
    .filter((family) =>
      family.municipalityCount >= minMunicipalities &&
      family.occurrenceCount >= minOccurrences
    )
    .map((family) => {
      const repeatedIncomplete = family.outcome === "incomplete";
      return {
        schema: "art/candidate-check/v1" as const,
        candidateId: candidateId("probe", family.probeId, family.outcome),
        status: "CANDIDATE" as const,
        sourceType: repeatedIncomplete
          ? "repeated_incomplete" as const
          : "remediation_pattern" as const,
        probeId: family.probeId,
        outcome: family.outcome,
        title: titleFor(family.probeId, family.outcome),
        rationale: repeatedIncomplete
          ? `This automated rule repeatedly requires review across ${family.municipalityCount} municipalities. Consider adding a deterministic or bounded review probe rather than treating it as a violation.`
          : `This violation pattern recurs across ${family.municipalityCount} municipalities. Consider whether a higher-level template/component remediation rule would add value beyond the underlying axe rule.`,
        firstObservedAt: now,
        lastObservedAt: now,
        municipalityCount: family.municipalityCount,
        occurrenceCount: family.occurrenceCount,
        municipalities: family.municipalities,
        proposedDetector: repeatedIncomplete
          ? "manual_review" as const
          : "deterministic_rule" as const,
        provenanceStatus: "UNKNOWN" as const,
        aiCalls: 0 as const,
      };
    });

  const journeyCandidates = cohort.journeyFamilies
    .filter((family) =>
      family.outcome === "incomplete" &&
      family.municipalityCount >= minMunicipalities &&
      family.resultCount >= minMunicipalities
    )
    .map((family) => ({
      schema: "art/candidate-check/v1" as const,
      candidateId: candidateId("journey", family.journeyId, family.outcome),
      status: "CANDIDATE" as const,
      sourceType: "journey_gap" as const,
      probeId: null,
      outcome: "incomplete" as const,
      title: `Resolve repeated journey gap: ${family.journeyId}`,
      rationale: `The bounded journey remained incomplete across ${family.municipalityCount} municipalities. Improve the deterministic journey/evidence model before interpreting this as a failure.`,
      firstObservedAt: now,
      lastObservedAt: now,
      municipalityCount: family.municipalityCount,
      occurrenceCount: family.resultCount,
      municipalities: family.municipalities,
      proposedDetector: "safe_journey" as const,
      provenanceStatus: "NOT_APPLICABLE" as const,
      aiCalls: 0 as const,
    }));

  const result = CandidateCatalogueSchema.parse({
    schema: "art/candidate-catalogue/v1",
    generatedAt: now,
    sourceCohortId: cohort.cohortId,
    candidates: [...issueCandidates, ...journeyCandidates],
    aiCalls: 0,
  });

  await writeFile(options.outPath, JSON.stringify(result, null, 2));
  return result;
}
