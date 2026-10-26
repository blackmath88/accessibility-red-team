import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import { AssessmentResultSchema, ReproducedObservationSchema, evidenceVersion } from "../src/evidence/contracts.js";
import { REVIEW_NAMESPACE } from "../src/report/local-approval.js";

const exec = promisify(execFile);

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

async function fixture(directory: string) {
  const evidenceBytes = Buffer.from("simulated local reviewer evidence\n");
  const sha256 = createHash("sha256").update(evidenceBytes).digest("hex");
  const evidenceRefs = [{ ref: "local-artifact://review-demo/dom", sha256 }];
  const assessmentBase = AssessmentResultSchema.parse(sample("assisted-assessment"));
  const assessment = AssessmentResultSchema.parse({ ...assessmentBase, evidenceRefs, evidenceVersion: evidenceVersion(evidenceRefs) });
  const observation = ReproducedObservationSchema.parse({ ...ReproducedObservationSchema.parse(sample("observation")), evidenceRefs });
  const sourceReport = {
    schema: "art/accessibility-report/v1",
    generatedAt: "2026-10-26T18:00:00.000Z",
    profileId: "legacy-profile",
    target: { requestedUrl: "https://example.test/", finalUrl: "https://example.test/" },
    summary: { violations: 0, incomplete: 0, applicable: 0, bestPractice: 0, unknownApplicability: 0 },
    findings: [],
    aiCalls: 0,
  };
  const paths = {
    report: join(directory, "report.json"), candidates: join(directory, "candidates.json"), bindings: join(directory, "bindings.json"),
    evidenceRoot: join(directory, "evidence"), evidence: join(directory, "evidence", "dom.txt"), request: join(directory, "request.json"),
    allowedSigners: join(directory, "allowed_signers"), approvals: join(directory, "approvals.jsonl"), output: join(directory, "publication.json"),
    key: join(directory, "simulated-reviewer"), otherKey: join(directory, "other-reviewer"),
  };
  await mkdir(paths.evidenceRoot);
  await Promise.all([
    writeFile(paths.report, JSON.stringify(sourceReport)),
    writeFile(paths.candidates, JSON.stringify({ schema: "art/publication-candidate-set/v1", candidates: [
      { candidateId: "assisted", record: assessment, observation },
    ] })),
    writeFile(paths.bindings, JSON.stringify({ schema: "art/local-evidence-binding-set/v1", bindings: [
      { ref: evidenceRefs[0]!.ref, path: "dom.txt" },
    ] })),
    writeFile(paths.evidence, evidenceBytes),
    writeFile(paths.approvals, ""),
  ]);
  await exec("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", paths.key]);
  await exec("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", paths.otherKey]);
  const publicKey = await readFile(`${paths.key}.pub`, "utf8");
  await writeFile(paths.allowedSigners, `simulated-reviewer ${publicKey.trim()}\n`);
  return { paths, assessment, observation };
}

function prepareArgs(paths: Awaited<ReturnType<typeof fixture>>["paths"]): string[] {
  return ["publication-review-request", paths.report, paths.candidates, "--bindings", paths.bindings,
    "--evidence-root", paths.evidenceRoot, "--candidate", "assisted", "--reviewer", "simulated-reviewer",
    "--note", "SIMULATED reviewer approval for local integration test only.", "--out", paths.request];
}

function exportArgs(paths: Awaited<ReturnType<typeof fixture>>["paths"], out = paths.output): string[] {
  return ["publication-export-approved", paths.report, paths.candidates, "--bindings", paths.bindings,
    "--evidence-root", paths.evidenceRoot, "--allowed-signers", paths.allowedSigners,
    "--approvals", paths.approvals, "--out", out];
}

test("simulated reviewer signature drives the full local approval and export flow", async () => {
  const directory = await mkdtemp(join(tmpdir(), "art-local-approval-e2e-"));
  try {
    const { paths } = await fixture(directory);
    const repository = new URL("..", import.meta.url).pathname;
    const prepared = await runCli(prepareArgs(paths), repository);
    assert.equal(prepared.code, 0, prepared.stderr);
    assert.equal(JSON.parse(prepared.stdout).signingNamespace, REVIEW_NAMESPACE);
    await exec("ssh-keygen", ["-Y", "sign", "-f", paths.key, "-n", REVIEW_NAMESPACE, paths.request]);
    const recorded = await runCli(["publication-review-record", paths.request, `${paths.request}.sig`,
      "--allowed-signers", paths.allowedSigners, "--approvals", paths.approvals], repository);
    assert.equal(recorded.code, 0, recorded.stderr);

    const exported = await runCli(exportArgs(paths), repository);
    assert.equal(exported.code, 0, exported.stderr);
    assert.deepEqual(JSON.parse(exported.stdout), { included: 1, rejected: 0, automatic: 0, reviewerApproved: 1,
      verifiedEvidenceRefs: 1, verifiedApprovals: 1 });
    const publication = JSON.parse(await readFile(paths.output, "utf8"));
    assert.equal(publication.findings[0].candidateId, "assisted");
    assert.equal(publication.findings[0].eligibility, "reviewer_approved");

    await runCli(["publication-review-record", paths.request, `${paths.request}.sig`,
      "--allowed-signers", paths.allowedSigners, "--approvals", paths.approvals], repository);
    assert.equal((await readFile(paths.approvals, "utf8")).trim().split("\n").length, 2, "recording appends and does not overwrite");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("approved local export rejects missing, stale, modified and unauthorized approval context", async () => {
  const directory = await mkdtemp(join(tmpdir(), "art-local-approval-reject-"));
  try {
    const { paths, assessment, observation } = await fixture(directory);
    const repository = new URL("..", import.meta.url).pathname;
    let result = await runCli(exportArgs(paths), repository);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).rejected, 1);

    assert.equal((await runCli(prepareArgs(paths), repository)).code, 0);
    await exec("ssh-keygen", ["-Y", "sign", "-f", paths.key, "-n", REVIEW_NAMESPACE, paths.request]);
    assert.equal((await runCli(["publication-review-record", paths.request, `${paths.request}.sig`,
      "--allowed-signers", paths.allowedSigners, "--approvals", paths.approvals], repository)).code, 0);

    const report = await readFile(paths.report, "utf8");
    await writeFile(paths.report, `${report}\n`);
    result = await runCli(exportArgs(paths), repository);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).rejected, 1, "changed source-report bytes cannot reuse approval");
    await writeFile(paths.report, report);

    await writeFile(paths.candidates, JSON.stringify({ schema: "art/publication-candidate-set/v1", candidates: [
      { candidateId: "assisted", record: { ...assessment, claim: "changed after approval" }, observation },
    ] }));
    result = await runCli(exportArgs(paths), repository);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).rejected, 1, "changed assessment cannot reuse approval");

    await writeFile(paths.candidates, JSON.stringify({ schema: "art/publication-candidate-set/v1", candidates: [
      { candidateId: "assisted", record: assessment, observation: { ...observation, contextId: "changed-after-approval" } },
    ] }));
    result = await runCli(exportArgs(paths), repository);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).rejected, 1, "changed observation cannot reuse approval");

    await writeFile(paths.candidates, JSON.stringify({ schema: "art/publication-candidate-set/v1", candidates: [
      { candidateId: "assisted", record: assessment, observation },
    ] }));
    await writeFile(paths.evidence, "modified evidence bytes\n");
    result = await runCli(exportArgs(paths), repository);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /does not match its expected SHA-256/);

    await writeFile(paths.evidence, "simulated local reviewer evidence\n");
    const otherPublicKey = await readFile(`${paths.otherKey}.pub`, "utf8");
    await writeFile(paths.allowedSigners, `simulated-reviewer ${otherPublicKey.trim()}\n`);
    result = await runCli(exportArgs(paths), repository);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /not authorized/);

    const lines = (await readFile(paths.approvals, "utf8")).trim().split("\n");
    const envelope = JSON.parse(lines[0]!);
    envelope.request.note = "modified approval";
    await writeFile(paths.approvals, `${JSON.stringify(envelope)}\n`);
    result = await runCli(exportArgs(paths), repository);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /modified request/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("approved local export cannot overwrite inputs through aliases and approval CLIs reject malformed layouts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "art-local-approval-cli-"));
  try {
    const { paths, assessment, observation } = await fixture(directory);
    const repository = new URL("..", import.meta.url).pathname;
    await writeFile(paths.candidates, JSON.stringify({ schema: "art/publication-candidate-set/v1", candidates: [
      { candidateId: "assisted", record: { ...assessment, assessment_mode: "automated" }, observation },
    ] }));
    const automated = await runCli(prepareArgs(paths), repository);
    assert.equal(automated.code, 1);
    assert.match(automated.stderr, /does not promote or authorize automated probes/);
    await writeFile(paths.candidates, JSON.stringify({ schema: "art/publication-candidate-set/v1", candidates: [
      { candidateId: "assisted", record: assessment, observation },
    ] }));
    const evidenceAlias = join(directory, "evidence-alias");
    await symlink(paths.evidence, evidenceAlias);
    const result = await runCli(exportArgs(paths, evidenceAlias), repository);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /must not overwrite/);

    for (const args of [
      ["publication-review-request"],
      ["publication-review-record", "request.json", "request.sig", "--allowed-signers", "allowed"],
      ["publication-export-approved", "report.json", "candidates.json", "--bindings", "bindings.json", "--evidence-root", "evidence"],
    ]) {
      const malformed = await runCli(args, repository);
      assert.equal(malformed.code, 2, args.join(" "));
      assert.match(malformed.stderr, /Usage:/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
