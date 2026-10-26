import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AssessmentResultSchema,
  HumanAdjudicationSchema,
  ReproducedObservationSchema,
  evidenceVersion,
  reviewDigest,
} from "../src/evidence/contracts.js";
import { buildIntegrityOnlyPublicationExport, verifyLocalEvidence } from "../src/report/local-integrity.js";
import { buildPublicationExportFromTrustedContext, publicationRecordDigest } from "../src/report/publication.js";

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

const sourceReport = JSON.stringify({
  schema: "art/accessibility-report/v1",
  generatedAt: "2026-10-26T18:00:00.000Z",
  profileId: "legacy-profile",
  target: { requestedUrl: "https://example.test/", finalUrl: "https://example.test/" },
  summary: { violations: 0, incomplete: 0, applicable: 0, bestPractice: 0, unknownApplicability: 0 },
  findings: [],
  aiCalls: 0,
});

async function fixture(directory: string) {
  const evidenceBytes = Buffer.from("locally captured evidence bytes\n");
  const sha256 = createHash("sha256").update(evidenceBytes).digest("hex");
  const evidenceRefs = [{ ref: "local-artifact://run-1/dom", sha256 }];
  const assessmentBase = AssessmentResultSchema.parse(sample("assisted-assessment"));
  const assessment = AssessmentResultSchema.parse({ ...assessmentBase, evidenceRefs, evidenceVersion: evidenceVersion(evidenceRefs) });
  const observationBase = ReproducedObservationSchema.parse(sample("observation"));
  const observation = ReproducedObservationSchema.parse({ ...observationBase, evidenceRefs });
  const sourceReportPath = join(directory, "report.json");
  const candidatesPath = join(directory, "candidates.json");
  const bindingsPath = join(directory, "bindings.json");
  const evidenceRoot = join(directory, "evidence");
  const evidencePath = join(evidenceRoot, "dom.bin");
  await mkdir(evidenceRoot);
  await Promise.all([
    writeFile(sourceReportPath, sourceReport),
    writeFile(candidatesPath, JSON.stringify({ schema: "art/publication-candidate-set/v1", candidates: [
      { candidateId: "assisted", record: assessment, observation },
    ] })),
    writeFile(bindingsPath, JSON.stringify({ schema: "art/local-evidence-binding-set/v1", bindings: [
      { ref: evidenceRefs[0]!.ref, path: "dom.bin" },
    ] })),
    writeFile(evidencePath, evidenceBytes),
  ]);
  return { assessment, observation, evidenceRefs, sourceReportPath, candidatesPath, bindingsPath, evidenceRoot, evidencePath };
}

test("local integrity mode hashes actual bytes and keeps publication blocked without reviewer/scope authority", async () => {
  const directory = await mkdtemp(join(tmpdir(), "art-local-integrity-"));
  try {
    const input = await fixture(directory);
    const outPath = join(directory, "publication.json");
    const result = await buildIntegrityOnlyPublicationExport({ ...input, outPath, now: () => new Date("2026-10-26T19:00:00.000Z") });
    assert.deepEqual(result.verifiedEvidenceRefs, input.evidenceRefs);
    assert.equal(result.export.authorityId, "local-integrity-only:review-authority-unavailable");
    assert.equal(result.export.summary.included, 0);
    assert.equal(result.export.summary.rejected, 1);
    assert.match(result.export.rejected[0]!.reasons.join(" "), /outside the applicable scope/);
    assert.equal(JSON.parse(await readFile(outPath, "utf8")).findings.length, 0);
    await assert.rejects(() => buildIntegrityOnlyPublicationExport({ ...input, outPath: input.evidencePath }), /must not overwrite/);

    const cliOut = join(directory, "cli-publication.json");
    const cli = await runCli(["publication-export-local", input.sourceReportPath, input.candidatesPath,
      "--bindings", input.bindingsPath, "--evidence-root", input.evidenceRoot, "--out", cliOut], process.cwd());
    assert.equal(cli.code, 0, cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout), { included: 0, rejected: 1, automatic: 0, reviewerApproved: 0,
      verifiedEvidenceRefs: 1, reviewerAuthority: "unavailable" });
    assert.equal(JSON.parse(await readFile(cliOut, "utf8")).findings.length, 0);

    await writeFile(input.evidencePath, "changed bytes\n");
    await assert.rejects(() => buildIntegrityOnlyPublicationExport({ ...input, outPath }), /does not match its expected SHA-256/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("local evidence verification rejects missing, conflicting and out-of-root bindings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "art-local-integrity-boundary-"));
  try {
    const input = await fixture(directory);
    await assert.rejects(() => verifyLocalEvidence({ evidenceRoot: input.evidenceRoot, requiredRefs: input.evidenceRefs,
      bindings: { schema: "art/local-evidence-binding-set/v1", bindings: [] } }), /No local artifact binding/);
    await assert.rejects(() => verifyLocalEvidence({ evidenceRoot: input.evidenceRoot,
      requiredRefs: [...input.evidenceRefs, { ...input.evidenceRefs[0]!, sha256: "0".repeat(64) }],
      bindings: { schema: "art/local-evidence-binding-set/v1", bindings: [{ ref: input.evidenceRefs[0]!.ref, path: "dom.bin" }] } }), /conflicting expected hashes/);
    const evidenceBytes = await readFile(input.evidencePath);
    const outside = join(directory, "outside.bin");
    const outsideAlias = join(input.evidenceRoot, "outside-alias.bin");
    await writeFile(outside, evidenceBytes);
    await symlink(outside, outsideAlias);
    await assert.rejects(() => verifyLocalEvidence({ evidenceRoot: input.evidenceRoot, requiredRefs: input.evidenceRefs,
      bindings: { schema: "art/local-evidence-binding-set/v1", bindings: [{ ref: input.evidenceRefs[0]!.ref, path: "outside-alias.bin" }] } }), /outside the evidence root/);
    for (const path of ["../outside.bin", outside]) {
      await assert.rejects(() => verifyLocalEvidence({ evidenceRoot: input.evidenceRoot, requiredRefs: input.evidenceRefs,
        bindings: { schema: "art/local-evidence-binding-set/v1", bindings: [{ ref: input.evidenceRefs[0]!.ref, path }] } }), /outside the evidence root/);
    }
    const dotted = join(input.evidenceRoot, "..evidence.bin");
    await writeFile(dotted, evidenceBytes);
    assert.deepEqual(await verifyLocalEvidence({ evidenceRoot: input.evidenceRoot, requiredRefs: input.evidenceRefs,
      bindings: { schema: "art/local-evidence-binding-set/v1", bindings: [{ ref: input.evidenceRefs[0]!.ref, path: "..evidence.bin" }] } }), input.evidenceRefs);
    const inRootAlias = join(input.evidenceRoot, "in-root-alias.bin");
    await symlink(input.evidencePath, inRootAlias);
    assert.deepEqual(await verifyLocalEvidence({ evidenceRoot: input.evidenceRoot, requiredRefs: input.evidenceRefs,
      bindings: { schema: "art/local-evidence-binding-set/v1", bindings: [{ ref: input.evidenceRefs[0]!.ref, path: "in-root-alias.bin" }] } }), input.evidenceRefs);
    await mkdir(join(input.evidenceRoot, "directory"));
    await assert.rejects(() => verifyLocalEvidence({ evidenceRoot: input.evidenceRoot, requiredRefs: input.evidenceRefs,
      bindings: { schema: "art/local-evidence-binding-set/v1", bindings: [{ ref: input.evidenceRefs[0]!.ref, path: "directory" }] } }), /regular file/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("local integrity CLI rejects malformed flag layouts before reading inputs", async () => {
  for (const args of [
    ["publication-export-local"],
    ["publication-export-local", "report.json", "candidates.json", "--bindings", "bindings.json", "--evidence-root", "root"],
    ["publication-export-local", "report.json", "candidates.json", "--bindings", "bindings.json", "--bindings", "other.json", "--out", "out.json"],
    ["publication-export-local", "report.json", "candidates.json", "--bindings", "--out", "bindings.json", "--evidence-root", "root"],
  ]) {
    const result = await runCli(args, process.cwd());
    assert.equal(result.code, 2, args.join(" "));
    assert.match(result.stderr, /Usage:/, args.join(" "));
  }
});

test("verified local receipts can feed the existing export only with explicitly simulated external authority", async () => {
  const directory = await mkdtemp(join(tmpdir(), "art-local-integrity-simulated-"));
  try {
    const input = await fixture(directory);
    const bindings = JSON.parse(await readFile(input.bindingsPath, "utf8"));
    const verifiedEvidenceRefs = await verifyLocalEvidence({ evidenceRoot: input.evidenceRoot, requiredRefs: input.evidenceRefs, bindings });
    const reviewBase = HumanAdjudicationSchema.parse(sample("adjudication"));
    const simulatedReview = HumanAdjudicationSchema.parse({
      ...reviewBase,
      assessmentId: input.assessment.assessmentId,
      claimVersion: input.assessment.claimVersion,
      evidenceVersion: input.assessment.evidenceVersion,
      synthetic: false,
      note: "Explicitly simulated authenticated authority for this test only; never real sign-off.",
    });
    await writeFile(input.candidatesPath, JSON.stringify({ schema: "art/publication-candidate-set/v1", candidates: [
      { candidateId: "assisted", record: input.assessment, observation: input.observation, adjudication: simulatedReview },
    ] }));
    const result = await buildPublicationExportFromTrustedContext({
      sourceReportPath: input.sourceReportPath,
      candidatesPath: input.candidatesPath,
      outPath: join(directory, "simulated-publication.json"),
      authority: {
        schema: "art/publication-authority/v1",
        authorityId: "simulated-authenticated-authority-test-only",
        sourceReportSha256: createHash("sha256").update(sourceReport).digest("hex"),
        authorizedReviewerIds: [simulatedReview.reviewerId],
        authorizedReviewDigests: [reviewDigest(simulatedReview)],
        candidates: [{
          candidateId: "assisted",
          assessmentDigest: publicationRecordDigest(input.assessment),
          observationDigest: publicationRecordDigest(input.observation),
          verifiedEvidenceRefs,
          scope: { subjectId: input.assessment.subjectId, obligationId: input.assessment.obligationId, applicable: true },
        }],
      },
    });
    assert.equal(result.summary.reviewerApproved, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
