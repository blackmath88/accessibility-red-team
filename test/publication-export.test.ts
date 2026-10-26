import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  AssessmentResultSchema,
  HumanAdjudicationSchema,
  ProbeExecutionSchema,
  ReproducedObservationSchema,
  claimVersion,
  reviewDigest,
} from "../src/evidence/contracts.js";
import { skipLinkDigests, skipLinkEntry } from "../src/catalogue/registry.js";
import { buildPublicationExport, publicationRecordDigest, PublicationExportSchema } from "../src/report/publication.js";

function sample(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../docs/experiments/samples/evidence-${name}.json`, import.meta.url), "utf8"));
}

function runCli(args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
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
    const synthetic = HumanAdjudicationSchema.parse(sample("adjudication"));
    const digests = skipLinkDigests();
    const automatedBase = AssessmentResultSchema.parse(sample("automated-assessment"));
    const automated = AssessmentResultSchema.parse({
      ...automatedBase,
      ...digests,
      claim: skipLinkEntry.claimTemplate,
      claimVersion: claimVersion({ ...automatedBase, ...digests, claim: skipLinkEntry.claimTemplate }),
    });
    const execution = ProbeExecutionSchema.parse({ ...ProbeExecutionSchema.parse(sample("execution")), ...digests });
    const probeReview = {
      reviewerId: "simulated-probe-reviewer",
      decidedAt: automated.executedAt,
      decision: "approve_trusted" as const,
      ...digests,
      synthetic: false,
      note: "Simulated probe authority for this integration test only; not real sign-off.",
    };
    const trustedEntry = { ...skipLinkEntry, maturity: "trusted" as const, review: probeReview };
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
    const automatedTrusted = () => ({
      assessmentDigest: publicationRecordDigest(automated),
      executionDigest: publicationRecordDigest(execution),
      verifiedEvidenceRefs: automated.evidenceRefs,
      scope: { subjectId: automated.subjectId, obligationId: automated.obligationId, applicable: true },
      currentDigests: digests,
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
        { candidateId: "trusted-automated", record: automated, entry: trustedEntry, execution },
        { candidateId: "candidate-probe", record: automated, entry: skipLinkEntry, execution },
        { candidateId: "approved", ...base, adjudication: approved },
        { candidateId: "stale", ...base, adjudication: stale },
        { candidateId: "synthetic", ...base, adjudication: synthetic },
        { candidateId: "missing-evidence", ...base, adjudication: approved },
        { candidateId: "duplicate-assessment", ...base, adjudication: approved },
        { candidateId: "missing-trusted-context", ...base, adjudication: approved },
        { candidateId: "changed-assessment", record: { ...assessment, claim: "Changed after authority issuance" }, observation, adjudication: approved },
        { candidateId: "changed-observation", record: assessment, observation: { ...observation, contextId: "changed-after-authority" }, adjudication: approved },
        { candidateId: "changed-execution", record: automated, entry: trustedEntry, execution: { ...execution, executionId: "changed-after-authority" } },
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
      authorizedReviewerIds: [approved.reviewerId, probeReview.reviewerId],
      authorizedReviewDigests: [reviewDigest(approved), reviewDigest(stale), reviewDigest(synthetic), reviewDigest(probeReview)],
      candidates: [
        { candidateId: "trusted-automated", ...automatedTrusted() },
        { candidateId: "candidate-probe", ...automatedTrusted() },
        { candidateId: "approved", ...trusted() },
        { candidateId: "stale", ...trusted() },
        { candidateId: "synthetic", ...trusted() },
        { candidateId: "missing-evidence", ...trusted(), verifiedEvidenceRefs: [] },
        { candidateId: "duplicate-assessment", ...trusted() },
        { candidateId: "changed-assessment", ...trusted() },
        { candidateId: "changed-observation", ...trusted() },
        { candidateId: "changed-execution", ...automatedTrusted() },
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
    assert.equal(result.summary.included, 2);
    assert.equal(result.summary.reviewerApproved, 1);
    assert.equal(result.summary.automatic, 1);
    assert.equal(result.summary.rejected, 10);
    assert.deepEqual(result.findings.map((item) => [item.candidateId, item.eligibility]), [
      ["trusted-automated", "automatic"],
      ["approved", "reviewer_approved"],
    ]);
    assert.equal(result.findings[1]?.assessment.publication_eligibility, "reviewer_approved");
    assert.equal(result.sourceReport.claimClass, "legacy_snapshot_not_policy_evaluated");
    const rejected = new Map(result.rejected.map((item) => [item.candidateId, item]));
    assert.match(rejected.get("candidate-probe")!.reasons.join(" "), /currently approved trusted probe/);
    assert.match(rejected.get("stale")!.reasons.join(" "), /Stale adjudication/);
    assert.match(rejected.get("synthetic")!.reasons.join(" "), /Synthetic/);
    assert.match(rejected.get("missing-evidence")!.reasons.join(" "), /integrity-verification receipt/);
    assert.match(rejected.get("duplicate-assessment")!.reasons.join(" "), /Duplicate assessmentId/);
    assert.match(rejected.get("missing-trusted-context")!.reasons.join(" "), /Missing trusted evidence/);
    for (const id of ["changed-assessment", "changed-observation", "changed-execution"]) {
      assert.match(rejected.get(id)!.reasons.join(" "), /does not match trusted exact-version context/);
    }
    assert.equal(rejected.get("raw-hypothesis")!.assessmentId, null);

    const written = await readFile(outPath, "utf8");
    assert.deepEqual(PublicationExportSchema.parse(JSON.parse(written)), result);
    assert.doesNotMatch(written, /suspectedBarrier|falsifyingTest|may have no target/);

    await writeFile(sourceReportPath, `${sourceReport}\n`);
    await assert.rejects(() => buildPublicationExport({ sourceReportPath, candidatesPath, authorityPath, outPath }), /does not match the exact source report bytes/);

    await writeFile(sourceReportPath, sourceReport);
    const inputAlias = join(directory, "report-alias.json");
    await symlink(sourceReportPath, inputAlias);
    await assert.rejects(() => buildPublicationExport({ sourceReportPath, candidatesPath, authorityPath, outPath: inputAlias }), /must not overwrite/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("publication export CLI rejects malformed argument layouts before reading inputs", async () => {
  const repository = new URL("..", import.meta.url).pathname;
  for (const args of [
    ["publication-export"],
    ["publication-export", "report.json", "candidates.json", "--authority", "authority.json"],
    ["publication-export", "report.json", "candidates.json", "--authority", "authority.json", "--authority", "other.json"],
    ["publication-export", "report.json", "candidates.json", "--authority", "--out", "publication.json", "extra.json"],
    ["publication-export", "--authority", "candidates.json", "--authority", "authority.json", "--out", "publication.json"],
  ]) {
    const result = await runCli(args, repository);
    assert.equal(result.code, 2, args.join(" "));
    assert.match(result.stderr, /Usage:/, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
  }
});
