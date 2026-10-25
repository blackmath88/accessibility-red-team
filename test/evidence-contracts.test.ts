import test from "node:test";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as c from "../src/evidence/contracts.js";
import { decidePublication, type PublicationInput } from "../src/evidence/policy.js";
import { resolveCase } from "../src/evidence/cases.js";
import { entryDigest, type ReviewerDecision } from "../src/catalogue/contracts.js";
import { runSkipLinkProbe, skipLinkEntry, skipLinkDigests } from "../src/catalogue/registry.js";
import { applyReviewerDecision, evaluateGate, type ValidationRecord } from "../src/promotion/gate.js";
import { challengeCases } from "./fixtures/skip-link-probe/cases.js";

function sample(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../docs/experiments/samples/evidence-${name}.json`, import.meta.url), "utf8"));
}
function automated(patch: Partial<c.AssessmentResult> = {}): c.AssessmentResult {
  const base = { ...c.AssessmentResultSchema.parse(sample("automated-assessment")), ...skipLinkDigests(), ...patch };
  return c.AssessmentResultSchema.parse({ ...base, claimVersion: c.claimVersion(base), evidenceVersion: c.evidenceVersion(base.evidenceRefs) });
}
function assisted(patch: Partial<c.AssessmentResult> = {}): c.AssessmentResult {
  const base = { ...c.AssessmentResultSchema.parse(sample("assisted-assessment")), ...patch };
  return c.AssessmentResultSchema.parse({ ...base, claimVersion: c.claimVersion(base), evidenceVersion: c.evidenceVersion(base.evidenceRefs) });
}
function observation() { return c.ReproducedObservationSchema.parse(sample("observation")); }
function findingCase() { return c.FindingCaseSchema.parse(sample("case")); }
function adjudication(assessment: c.AssessmentResult, patch: Partial<c.HumanAdjudication> = {}) {
  return c.HumanAdjudicationSchema.parse({ ...c.HumanAdjudicationSchema.parse(sample("adjudication")), assessmentId: assessment.assessmentId, claimVersion: assessment.claimVersion, evidenceVersion: assessment.evidenceVersion, ...patch });
}
function validation(): ValidationRecord {
  return { schema: "art/probe-validation/v1", probeId: skipLinkEntry.probeId, ...skipLinkDigests(), cases: challengeCases.map((item) => ({ caseId: item.file, category: item.category, expected: item.expected, actual: item.expected, freshContext: true, supported: true, independent: item.category === "independent_structure" })) };
}
function context(record: c.AssessmentResult): PublicationInput {
  return { record, authorizedReviewerIds: [], authorizedReviewDigests: [], verifiedEvidenceRefs: record.evidenceRefs, scope: { subjectId: record.subjectId, obligationId: record.obligationId, applicable: true } };
}
function trustedInput(): PublicationInput {
  const assessment = automated({ claim: skipLinkEntry.claimTemplate });
  const digests = skipLinkDigests();
  const decision: ReviewerDecision = { reviewerId: "unit-probe-reviewer", decidedAt: assessment.executedAt, decision: "approve_trusted", ...digests, synthetic: false, note: "Synthetic unit input exercises the non-synthetic branch; no real review" };
  const validationRecord = validation();
  const entry = applyReviewerDecision(skipLinkEntry, decision, digests, { validationRecord, result: evaluateGate(skipLinkEntry, validationRecord, digests) }).entry;
  assert.equal(entry.maturity, "trusted");
  const execution = c.ProbeExecutionSchema.parse({ ...c.ProbeExecutionSchema.parse(sample("execution")), ...digests });
  return { ...context(assessment), entry, currentDigests: digests, execution, authorizedReviewerIds: [decision.reviewerId], authorizedReviewDigests: [c.reviewDigest(decision)] };
}
function humanInput(mode: "manual" | "assisted" = "assisted"): PublicationInput {
  const assessment = assisted({ assessment_mode: mode });
  // Explicitly simulated human authority: this is not an actual reviewer sign-off.
  const review = adjudication(assessment, { synthetic: false });
  return { ...context(assessment), observation: observation(), adjudication: review, authorizedReviewerIds: [review.reviewerId], authorizedReviewDigests: [c.reviewDigest(review)] };
}
function retest(assessment: c.AssessmentResult | null, status: c.CaseRetest["execution_status"] = "completed") {
  return c.CaseRetestSchema.parse({ schema: "art/case-retest/v1", retestId: "unit-retest", execution_status: status, assessment });
}

const schemas = {
  "art/probe-execution/v1": c.ProbeExecutionSchema,
  "art/assessment-result/v1": c.AssessmentResultSchema,
  "art/hypothesis/v1": c.HypothesisSchema,
  "art/reproduced-observation/v1": c.ReproducedObservationSchema,
  "art/human-adjudication/v1": c.HumanAdjudicationSchema,
  "art/finding-case/v1": c.FindingCaseSchema,
  "art/case-retest/v1": c.CaseRetestSchema,
};
test("every evidence JSON sample is schema-valid and clearly synthetic", () => {
  const directory = new URL("../docs/experiments/samples/", import.meta.url);
  const files = readdirSync(directory).filter((name) => /^evidence-.*\.json$/.test(name));
  assert.equal(files.length, 8);
  for (const file of files) {
    const raw = JSON.parse(readFileSync(new URL(file, directory), "utf8"));
    const schema = schemas[raw.schema as keyof typeof schemas];
    assert.ok(schema, file);
    assert.ok(schema.safeParse(raw).success, file);
    assert.match(JSON.stringify(raw), /synthetic/i, file);
  }
  assert.equal(c.HumanAdjudicationSchema.parse(sample("adjudication")).synthetic, true);
});

test("parsed records, nested evidence and arrays are immutable snapshots", () => {
  const assessment = automated();
  assert.ok(Object.isFrozen(assessment));
  assert.ok(Object.isFrozen(assessment.evidenceRefs));
  assert.ok(Object.isFrozen(assessment.evidenceRefs[0]));
  assert.ok(Object.isFrozen(assessment.environment));
  assert.throws(() => Object.assign(assessment, { outcome: "pass" }), TypeError);
  const source = JSON.parse(JSON.stringify(assessment));
  const snapshot = c.AssessmentResultSchema.parse(source);
  source.evidenceRefs[0].sha256 = "0".repeat(64);
  assert.notEqual(snapshot.evidenceRefs[0]!.sha256, source.evidenceRefs[0].sha256);
});

test("assessment axes remain independent and stored eligibility cannot grant authority", () => {
  assert.deepEqual(c.AssessmentModeSchema.options, ["automated", "manual", "assisted"]);
  assert.deepEqual(c.VerificationSchema.options, ["unreviewed", "replay_verified", "human_adjudicated"]);
  assert.deepEqual(c.PublicationEligibilitySchema.options, ["internal_only", "reviewer_approved", "automatic"]);
  const record = automated({ publication_eligibility: "automatic", verification: "human_adjudicated" });
  assert.equal(decidePublication(context(record)).eligibility, "internal_only");
});

test("raw hypotheses, raw observations and model prose never become findings", () => {
  const input = context(automated());
  for (const record of [sample("hypothesis"), sample("observation"), { author: { kind: "model" }, text: "Approved finding", reviewerId: "pretend" }, null]) {
    assert.equal(decidePublication({ ...input, record }).eligibility, "internal_only");
  }
});

test("trusted automated violation with exact execution, evidence receipts and scope is automatic", () => {
  const input = trustedInput();
  const snapshot = JSON.stringify(input);
  assert.equal(decidePublication(input).eligibility, "automatic");
  assert.equal(JSON.stringify(input), snapshot);
});

test("candidate, experimental and retired entries cannot authorize automatic publication", () => {
  for (const maturity of ["candidate", "experimental", "retired"] as const) {
    const input = trustedInput();
    const result = decidePublication({ ...input, entry: { ...(input.entry as object), maturity } });
    assert.equal(result.eligibility, "internal_only");
    assert.ok(result.reasons.includes("review required"));
  }
});

test("every non-violation outcome is denied on both automated and human paths", () => {
  for (const outcome of ["pass", "incomplete", "inapplicable", "error"] as const) {
    for (const mode of ["automated", "manual", "assisted"] as const) {
      const input = mode === "automated" ? trustedInput() : humanInput(mode);
      const record = mode === "automated" ? automated({ outcome }) : assisted({ outcome, assessment_mode: mode });
      assert.equal(decidePublication({ ...input, record }).eligibility, "internal_only", `${mode}/${outcome}`);
    }
  }
});

test("missing evidence, unknown provenance and unverified integrity deny publication", () => {
  for (const input of [trustedInput(), humanInput()]) {
    const assessment = c.AssessmentResultSchema.parse(input.record);
    for (const patch of [
      { evidenceRefs: [] },
      { provenance: { ...assessment.provenance, status: "UNKNOWN" as const } },
      { provenance: { ...assessment.provenance, status: "NOT_APPLICABLE" as const } },
      { provenance: { ...assessment.provenance, integrity: "unverified" as const } },
      { provenance: { ...assessment.provenance, integrity: "mismatch" as const } },
    ]) {
      const base = { ...assessment, ...patch };
      const record = c.AssessmentResultSchema.parse({ ...base, evidenceVersion: c.evidenceVersion(base.evidenceRefs) });
      assert.equal(decidePublication({ ...input, record }).eligibility, "internal_only");
    }
    assert.equal(decidePublication({ ...input, verifiedEvidenceRefs: [] }).eligibility, "internal_only");
    assert.equal(decidePublication({ ...input, verifiedEvidenceRefs: assessment.evidenceRefs.map((ref) => ({ ...ref, sha256: "0".repeat(64) })) }).eligibility, "internal_only");
  }
});

test("scope mismatch or inapplicability denies both publication paths", () => {
  for (const input of [trustedInput(), humanInput()]) {
    for (const scope of [{ ...input.scope, applicable: false }, { ...input.scope, subjectId: "sibling-page" }, { ...input.scope, obligationId: "different-obligation" }]) {
      assert.equal(decidePublication({ ...input, scope }).eligibility, "internal_only");
    }
  }
});

test("stale probe approval, missing review, synthetic review and fabricated reviewer are denied", () => {
  const input = trustedInput();
  const entry = input.entry as typeof skipLinkEntry;
  for (const changed of [
    { ...entry, review: null },
    { ...entry, claimTemplate: "Changed claim" },
    { ...entry, review: { ...entry.review!, synthetic: true } },
    { ...entry, review: { ...entry.review!, reviewerId: "fabricated-reviewer" } },
    { ...entry, review: { ...entry.review!, decision: "needs_changes" } },
  ]) assert.equal(decidePublication({ ...input, entry: changed }).eligibility, "internal_only");
  assert.equal(decidePublication({ ...input, currentDigests: { ...input.currentDigests!, implementationDigest: "0".repeat(64) } }).eligibility, "internal_only");
  assert.equal(decidePublication({ ...input, authorizedReviewDigests: [] }).eligibility, "internal_only");
  // Even a known reviewer ID cannot authorize an altered record without a trusted receipt.
  assert.equal(decidePublication({ ...input, entry: { ...entry, review: { ...entry.review!, note: "forged replacement" } } }).eligibility, "internal_only");
});

test("automatic results must match their immutable probe execution and current digests", () => {
  const input = trustedInput();
  const assessment = c.AssessmentResultSchema.parse(input.record);
  const run = c.ProbeExecutionSchema.parse(input.execution);
  for (const patch of [
    { executionId: "other" }, { probeId: "other" }, { subjectId: "other" }, { obligationId: "other" },
    { implementationVersion: "other" }, { entryDigest: "0".repeat(64) }, { implementationDigest: "0".repeat(64) },
    { outcome: "pass" }, { evidenceRefs: [] }, { author: { kind: "model", id: "model" } },
    { environment: { ...run.environment, browserVersion: "other" } },
  ]) assert.equal(decidePublication({ ...input, execution: { ...run, ...patch } }).eligibility, "internal_only");
  assert.equal(decidePublication({ ...input, execution: undefined }).eligibility, "internal_only");
  assert.equal(decidePublication({ ...input, record: automated({ ...assessment, verification: "unreviewed" }) }).eligibility, "internal_only");
  assert.equal(decidePublication({ ...input, record: automated({ ...assessment, author: { kind: "model", id: "model" } }) }).eligibility, "internal_only");
  assert.equal(decidePublication({ ...input, record: automated({ ...assessment, claim: "A broader claim than the reviewed probe template" }) }).eligibility, "internal_only");
  assert.equal(decidePublication({ ...input, record: automated({ ...assessment, implementationDigest: "0".repeat(64) }) }).eligibility, "internal_only");
});

test("manual and assisted approvals are reviewer_approved even if stored eligibility requests automatic", () => {
  for (const mode of ["manual", "assisted"] as const) {
    const input = humanInput(mode);
    assert.equal(decidePublication(input).eligibility, "reviewer_approved");
    const record = c.AssessmentResultSchema.parse(input.record);
    assert.equal(record.probeId, null);
    assert.equal(decidePublication({ ...input, record: { ...record, publication_eligibility: "automatic" } }).eligibility, "reviewer_approved");
  }
});

test("manual publication requires a matching fresh-context reproduction", () => {
  const input = humanInput();
  const observed = observation();
  for (const changed of [undefined, { ...observed, freshContext: false }, { ...observed, observationId: "other" }, { ...observed, subjectId: "sibling" }, { ...observed, evidenceRefs: [] }]) {
    assert.equal(decidePublication({ ...input, observation: changed }).eligibility, "internal_only");
  }
});

test("missing, fabricated, model-authored and synthetic adjudications never authorize publication", () => {
  const input = humanInput();
  const review = c.HumanAdjudicationSchema.parse(input.adjudication);
  for (const changed of [
    undefined, { text: "human approved" }, { ...review, reviewerId: undefined },
    { ...review, author: { kind: "model", id: review.reviewerId } },
    { ...review, synthetic: true },
    { ...review, reviewerId: "fabricated", author: { kind: "human", id: "fabricated" } },
    { ...review, note: "forged record using an authorized reviewer name" },
  ]) assert.equal(decidePublication({ ...input, adjudication: changed }).eligibility, "internal_only");
  assert.equal(decidePublication({ ...input, authorizedReviewerIds: [] }).eligibility, "internal_only");
  assert.equal(decidePublication({ ...input, authorizedReviewDigests: [] }).eligibility, "internal_only");
});

test("adjudications bind the exact assessment, claim and evidence versions", () => {
  const input = humanInput();
  const review = c.HumanAdjudicationSchema.parse(input.adjudication);
  for (const patch of [{ assessmentId: "other" }, { claimVersion: "0".repeat(64) }, { evidenceVersion: "0".repeat(64) }, { decision: "reject_finding" as const }, { decision: "needs_changes" as const }]) {
    const changed = c.HumanAdjudicationSchema.parse({ ...review, ...patch });
    assert.equal(decidePublication({ ...input, adjudication: changed, authorizedReviewDigests: [c.reviewDigest(changed)] }).eligibility, "internal_only");
  }
  const record = c.AssessmentResultSchema.parse(input.record);
  assert.equal(decidePublication({ ...input, record: { ...record, claim: "Changed prose without new version" } }).eligibility, "internal_only");
  const newEvidence = record.evidenceRefs.map((ref) => ({ ...ref, sha256: "0".repeat(64) }));
  const changed = assisted({ evidenceRefs: newEvidence });
  assert.equal(decidePublication({ ...input, record: changed, verifiedEvidenceRefs: newEvidence, observation: { ...observation(), evidenceRefs: newEvidence } }).eligibility, "internal_only");
});

test("synthetic human sample is denied and only simulated non-synthetic authority would approve it", () => {
  const record = c.AssessmentResultSchema.parse(sample("assisted-assessment"));
  const review = c.HumanAdjudicationSchema.parse(sample("adjudication"));
  const input = { ...context(record), observation: observation(), adjudication: review, authorizedReviewerIds: [review.reviewerId], authorizedReviewDigests: [c.reviewDigest(review)] };
  assert.equal(decidePublication(input).eligibility, "internal_only");
  assert.match(decidePublication(input).reasons.join(" "), /Synthetic/);
  const simulated = c.HumanAdjudicationSchema.parse({ ...review, synthetic: false });
  assert.equal(decidePublication({ ...input, adjudication: simulated, authorizedReviewDigests: [c.reviewDigest(simulated)] }).eligibility, "reviewer_approved");
});

test("end-to-end hypothesis → fresh reproduction → candidate gate → review required", () => {
  const hypothesis = c.HypothesisSchema.parse(sample("hypothesis"));
  const reproduced = observation();
  assert.equal(reproduced.hypothesisId, hypothesis.hypothesisId);
  assert.equal(reproduced.freshContext, true);
  const validationRecord = validation();
  const gate = evaluateGate(skipLinkEntry, validationRecord, skipLinkDigests());
  assert.equal(gate.verdict, "eligible_for_review");
  const record = automated();
  assert.equal(record.observationId, reproduced.observationId);
  assert.equal(record.evidenceVersion, c.evidenceVersion(reproduced.evidenceRefs));
  const result = decidePublication({ ...context(record), entry: skipLinkEntry, currentDigests: skipLinkDigests(), observation: reproduced });
  assert.equal(result.eligibility, "internal_only");
  assert.ok(result.reasons.includes("review required"));
  assert.equal(skipLinkEntry.maturity, "candidate");
  assert.equal(skipLinkEntry.review, null);
  assert.equal(entryDigest(skipLinkEntry), skipLinkDigests().entryDigest);
});

test("case resolution requires a comparable evidenced pass and returns a new history snapshot", () => {
  const original = findingCase();
  const input = retest(automated({ assessmentId: "pass-retest", outcome: "pass" }));
  const resolved = resolveCase(original, input);
  assert.equal(resolved.disposition, "resolved");
  assert.equal(original.disposition, "open");
  assert.notEqual(resolved, original);
  assert.ok(resolved.assessmentIds.includes("pass-retest"));
  assert.ok(resolved.retestIds.includes(input.retestId));
  assert.ok(Object.isFrozen(resolved));
});

test("omitted, skipped and blocked retests remain not_retested even with a pass payload", () => {
  assert.equal(resolveCase(findingCase(), null).disposition, "not_retested");
  assert.equal(resolveCase(findingCase(), retest(null)).disposition, "not_retested");
  for (const status of ["skipped", "blocked"] as const) {
    const result = resolveCase(findingCase(), retest(automated({ outcome: "pass" }), status));
    assert.equal(result.disposition, "not_retested");
    assert.deepEqual(result.assessmentIds, findingCase().assessmentIds);
  }
});

test("each non-passing retest and missing/unverified evidence remains unresolved", () => {
  for (const outcome of ["violation", "inapplicable", "incomplete", "error"] as const) {
    assert.equal(resolveCase(findingCase(), retest(automated({ outcome }))).disposition, "unresolved");
  }
  assert.equal(resolveCase(findingCase(), retest(automated({ outcome: "pass", evidenceRefs: [] }))).disposition, "unresolved");
  for (const patch of [{ verification: "unreviewed" as const }, { author: { kind: "model" as const, id: "model" } }, { executionId: null }, { assessment_mode: "manual" as const }]) {
    assert.equal(resolveCase(findingCase(), retest(automated({ outcome: "pass", ...patch }))).disposition, "unresolved");
  }
  const record = automated({ outcome: "pass" });
  assert.equal(resolveCase(findingCase(), retest({ ...record, claimVersion: "0".repeat(64) })).disposition, "unresolved");
});

test("different subject/obligation/probe or incompatible version is non_comparable", () => {
  for (const patch of [{ subjectId: "sibling" }, { obligationId: "different" }, { probeId: "other" }, { implementationVersion: "next" }]) {
    assert.equal(resolveCase(findingCase(), retest(automated({ outcome: "pass", ...patch }))).disposition, "non_comparable");
  }
  assert.equal(resolveCase(findingCase(), retest(assisted({ outcome: "pass" }))).disposition, "non_comparable");
});

test("implementation compatibility must be explicitly supplied and is directional", () => {
  const original = findingCase();
  const input = retest(automated({ outcome: "pass", implementationVersion: "next" }));
  assert.equal(resolveCase(original, input).disposition, "non_comparable");
  assert.equal(resolveCase(original, input, [{ from: original.implementationVersion!, to: "next" }]).disposition, "resolved");
  assert.equal(resolveCase(original, input, [{ from: "next", to: original.implementationVersion! }]).disposition, "non_comparable");
});

test("real local probe evidence flows through candidate validation to review-required publication", async () => {
  const browser = await chromium.launch({ headless: true });
  const validationRecord: ValidationRecord = { schema: "art/probe-validation/v1", probeId: skipLinkEntry.probeId, ...skipLinkDigests(), cases: [] };
  const hypothesis = c.HypothesisSchema.parse({ ...c.HypothesisSchema.parse(sample("hypothesis")), hypothesisId: "local-challenge-hypothesis" });
  let reproduced: c.ReproducedObservation | undefined;
  let assessment: c.AssessmentResult | undefined;
  let execution: c.ProbeExecution | undefined;
  try {
    for (const fixture of challengeCases) {
      const browserContext = await browser.newContext();
      try {
        const page = await browserContext.newPage();
        const url = new URL(`./fixtures/skip-link-probe/${fixture.file}.html`, import.meta.url).href;
        await page.goto(url);
        const wrapped = await runSkipLinkProbe(page, "local-challenge", url);
        validationRecord.cases.push({ caseId: fixture.file, category: fixture.category, expected: fixture.expected, actual: wrapped.result.outcome, supported: wrapped.result.outcome !== "error", freshContext: true, independent: fixture.category === "independent_structure" });
        if (fixture.category === "missing_target") {
          assert.equal(wrapped.result.outcome, "violation");
          const bytes = JSON.stringify({ result: wrapped.result, dom: await page.content() });
          const evidenceRefs = [{ ref: "memory://local-challenge/missing-target", sha256: createHash("sha256").update(bytes).digest("hex") }];
          const environment = { browserName: "chromium", browserVersion: browser.version(), platform: process.platform, probeRuntimeVersion: wrapped.result.journeyVersion };
          const provenance = { status: "KNOWN" as const, integrity: "verified" as const, source: "Local file fixture and in-memory DOM/result digest computed by this test" };
          const executedAt = new Date().toISOString();
          const author = { kind: "system" as const, id: "local-challenge-runner" };
          reproduced = c.ReproducedObservationSchema.parse({ schema: "art/reproduced-observation/v1", observationId: "local-challenge-observation", hypothesisId: hypothesis.hypothesisId, subjectId: hypothesis.subjectId, obligationId: hypothesis.obligationId, contextId: "local-challenge-missing-target-fresh-context", freshContext: true, evidenceRefs, observedAt: executedAt, author });
          execution = c.ProbeExecutionSchema.parse({ schema: "art/probe-execution/v1", executionId: "local-challenge-execution", subjectId: hypothesis.subjectId, obligationId: hypothesis.obligationId, probeId: wrapped.probeId, implementationVersion: wrapped.implementationVersion, entryDigest: wrapped.entryDigest, implementationDigest: wrapped.implementationDigest, outcome: wrapped.result.outcome, evidenceRefs, environment, executedAt, provenance, author });
          assessment = automated({ assessmentId: "local-challenge-assessment", executionId: execution.executionId, observationId: reproduced.observationId, evidenceRefs, environment, executedAt, provenance, author });
        }
      } finally {
        await browserContext.close();
      }
    }
    assert.ok(reproduced && assessment && execution);
    assert.equal(reproduced.hypothesisId, hypothesis.hypothesisId);
    assert.equal(assessment.observationId, reproduced.observationId);
    assert.equal(assessment.evidenceVersion, c.evidenceVersion(reproduced.evidenceRefs));
    assert.equal(evaluateGate(skipLinkEntry, validationRecord, skipLinkDigests()).verdict, "eligible_for_review");
    const decision = decidePublication({ ...context(assessment), entry: skipLinkEntry, currentDigests: skipLinkDigests(), observation: reproduced, execution });
    assert.equal(decision.eligibility, "internal_only");
    assert.ok(decision.reasons.includes("review required"));
    assert.equal(skipLinkEntry.maturity, "candidate");
  } finally {
    await browser.close();
  }
});
