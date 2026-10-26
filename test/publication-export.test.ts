import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  AssessmentResultSchema,
  HumanAdjudicationSchema,
  ReproducedObservationSchema,
  reviewDigest,
} from "../src/evidence/contracts.js";
import { buildPublicationExport, publicationRecordDigest, PublicationExportSchema } from "../src/report/publication.js";

function sample(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../docs/experiments/samples/evidence-${name}.json`, import.meta.url), "utf8"));
}

test("publication export includes authorized exact-version evidence and rejects stale, missing and raw inputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "art-publication-export-"));
  try {
    const sourceReportPath = join(directory, "report.json");
    const candidatesPath = join(directory, "candidates.json");
    const authorityPath = join(directory, "authority.json");
    const outPath = join(directory, "publication.json");
    const assessment = AssessmentResultSchema.parse(sample("assisted-assessment"));
    const observation = ReproducedObservationSchema.parse(sample("observation"));
    const approved = HumanAdjudicationSchema.parse({
      ...HumanAdjudicationSchema.parse(sample("adjudication")),
      synthetic: false,
      note: "Simulated non-synthetic authority for the export boundary integration test only.",
    });
    const stale = HumanAdjudicationSchema.parse({
      ...approved,
      adjudicationId: "stale-adjudication",
      claimVersion: "0".repeat(64),
    });
    const base = {
      record: assessment,
      observation,
    };
    const rawHypothesis = sample("hypothesis");
    const trusted = (record: unknown = assessment) => ({
      assessmentDigest: publicationRecordDigest(record),
      observationDigest: publicationRecordDigest(observation),
      verifiedEvidenceRefs: assessment.evidenceRefs,
      scope: { subjectId: assessment.subjectId, obligationId: assessment.obligationId, applicable: true },
    });

    const sourceReport = JSON.stringify({
      schema: "art/accessibility-report/v1",
      generatedAt: "2026-10-26T18:00:00.000Z",
      profileId: "legacy-profile",
      target: { requestedUrl: "https://example.test/", finalUrl: "https://example.test/" },
      summary: { violations: 0, incomplete: 0, applicable: 0, bestPractice: 0, unknownApplicability: 0 },
      findings: [],
      aiCalls: 0,
    });
    await writeFile(sourceReportPath, sourceReport);
    await writeFile(candidatesPath, JSON.stringify({
      schema: "art/publication-candidate-set/v1",
      candidates: [
        { candidateId: "approved", ...base, adjudication: approved },
        { candidateId: "stale", ...base, adjudication: stale },
        { candidateId: "missing-evidence", ...base, adjudication: approved },
        { candidateId: "duplicate-assessment", ...base, adjudication: approved },
        { candidateId: "missing-trusted-context", ...base, adjudication: approved },
        {
          candidateId: "raw-hypothesis",
          ...base,
          record: rawHypothesis,
          adjudication: approved,
        },
      ],
    }));
    await writeFile(authorityPath, JSON.stringify({
      schema: "art/publication-authority/v1",
      authorityId: "simulated-test-authority-v1",
      sourceReportSha256: createHash("sha256").update(sourceReport).digest("hex"),
      authorizedReviewerIds: [approved.reviewerId],
      authorizedReviewDigests: [reviewDigest(approved), reviewDigest(stale)],
      candidates: [
        { candidateId: "approved", ...trusted() },
        { candidateId: "stale", ...trusted() },
        { candidateId: "missing-evidence", ...trusted(), verifiedEvidenceRefs: [] },
        { candidateId: "duplicate-assessment", ...trusted() },
        { candidateId: "raw-hypothesis", ...trusted(rawHypothesis) },
      ],
    }));

    await assert.rejects(() => buildPublicationExport({
      sourceReportPath,
      candidatesPath,
      authorityPath,
      outPath: sourceReportPath,
    }), /must not overwrite/);

    const result = await buildPublicationExport({
      sourceReportPath,
      candidatesPath,
      authorityPath,
      outPath,
      now: () => new Date("2026-10-26T18:30:00.000Z"),
    });
    assert.equal(result.summary.included, 1);
    assert.equal(result.summary.reviewerApproved, 1);
    assert.equal(result.summary.automatic, 0);
    assert.equal(result.summary.rejected, 5);
    assert.equal(result.findings[0]?.candidateId, "approved");
    assert.equal(result.findings[0]?.eligibility, "reviewer_approved");
    assert.equal(result.findings[0]?.assessment.publication_eligibility, "reviewer_approved");
    assert.equal(result.sourceReport.claimClass, "legacy_snapshot_not_policy_evaluated");
    assert.deepEqual(result.rejected.map((item) => item.candidateId), ["stale", "missing-evidence", "duplicate-assessment", "missing-trusted-context", "raw-hypothesis"]);
    assert.match(result.rejected[0]!.reasons.join(" "), /Stale adjudication/);
    assert.match(result.rejected[1]!.reasons.join(" "), /integrity-verification receipt/);
    assert.match(result.rejected[2]!.reasons.join(" "), /Duplicate assessmentId/);
    assert.match(result.rejected[3]!.reasons.join(" "), /Missing trusted evidence/);
    assert.equal(result.rejected[4]!.assessmentId, null);

    const written = await readFile(outPath, "utf8");
    assert.deepEqual(PublicationExportSchema.parse(JSON.parse(written)), result);
    assert.doesNotMatch(written, /suspectedBarrier|falsifyingTest|may have no target/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
