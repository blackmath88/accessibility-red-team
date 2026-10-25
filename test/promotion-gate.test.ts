import test from "node:test";
import assert from "node:assert/strict";
import { entryDigest, implementationDigest, isTrustedEligible, type ProbeDigests, type ReviewerDecision } from "../src/catalogue/contracts.js";
import { skipLinkEntry, skipLinkDigests } from "../src/catalogue/registry.js";
import { applyReviewerDecision, challengeCounts, evaluateGate, requiredChallengeCategories, type ValidationRecord } from "../src/promotion/gate.js";
import { challengeCases } from "./fixtures/skip-link-probe/cases.js";

// These records exercise pure policy branches; they are synthetic unit inputs.
// Actual browser-derived challenge records are evaluated in skip-link-probe.test.ts.
function record(): ValidationRecord {
  return {
    schema: "art/probe-validation/v1",
    probeId: skipLinkEntry.probeId,
    ...skipLinkDigests(),
    cases: challengeCases.map((item) => ({ caseId: item.file, category: item.category, expected: item.expected, actual: item.expected, supported: true, freshContext: true, independent: item.category === "independent_structure" })),
  };
}
function eligibleGate() {
  const validationRecord = record();
  return { validationRecord, result: evaluateGate(skipLinkEntry, validationRecord, skipLinkDigests()) };
}
function review(digests: ProbeDigests, synthetic = true): ReviewerDecision {
  return { reviewerId: "unit-test-reviewer", decidedAt: "2026-10-25T19:00:00.000Z", decision: "approve_trusted", ...digests, synthetic, note: "Unit input only: never a real review of this probe." };
}

test("complete challenge evidence is eligible for review and cannot mutate maturity", () => {
  const before = structuredClone(skipLinkEntry);
  const input = record();
  const snapshot = structuredClone(input);
  assert.equal(evaluateGate(skipLinkEntry, input, skipLinkDigests()).verdict, "eligible_for_review");
  assert.deepEqual(skipLinkEntry, before);
  assert.deepEqual(input, snapshot);
  assert.equal(skipLinkEntry.maturity, "candidate");
});

test("each required challenge category is individually necessary", () => {
  for (const category of requiredChallengeCategories) {
    const input = record();
    input.cases = input.cases.filter((item) => item.category !== category);
    const gate = evaluateGate(skipLinkEntry, input, skipLinkDigests());
    assert.equal(gate.verdict, "insufficient_evidence", category);
    assert.ok(gate.reasons.some((reason) => reason.includes(category)));
  }
});

test("unsupported and unexpected error results block eligibility", () => {
  const unsupported = record();
  unsupported.cases[1]!.supported = false;
  assert.equal(evaluateGate(skipLinkEntry, unsupported, skipLinkDigests()).verdict, "insufficient_evidence");
  const errored = record();
  errored.cases[1]!.actual = "error";
  assert.equal(evaluateGate(skipLinkEntry, errored, skipLinkDigests()).verdict, "insufficient_evidence");
  const unexpectedAbstention = record();
  unexpectedAbstention.cases[1]!.actual = "incomplete";
  assert.equal(evaluateGate(skipLinkEntry, unexpectedAbstention, skipLinkDigests()).verdict, "insufficient_evidence");
});

test("false positives and false negatives reject, including a missed violation by abstention", () => {
  const fp = record();
  fp.cases[1]!.actual = "violation";
  assert.equal(evaluateGate(skipLinkEntry, fp, skipLinkDigests()).verdict, "rejected");
  assert.equal(challengeCounts(fp.cases).falsePositives, 1);
  for (const outcome of ["pass", "incomplete", "inapplicable", "error"] as const) {
    const fn = record();
    fn.cases[0]!.actual = outcome;
    assert.equal(evaluateGate(skipLinkEntry, fn, skipLinkDigests()).verdict, "rejected");
    assert.equal(challengeCounts(fn.cases).falseNegatives, 1);
  }
});

test("identity and every digest mismatch reject", () => {
  for (const field of ["probeId", "entryDigest", "implementationDigest"] as const) {
    const input = record();
    input[field] = "stale";
    assert.equal(evaluateGate(skipLinkEntry, input, skipLinkDigests()).verdict, "rejected");
  }
  assert.equal(evaluateGate({ ...skipLinkEntry, claimTemplate: "changed" }, record(), skipLinkDigests()).verdict, "rejected");
  assert.equal(evaluateGate(skipLinkEntry, record(), { ...skipLinkDigests(), implementationDigest: implementationDigest("changed source") }).verdict, "rejected");
});

test("fresh contexts, unique cases and independent challenge provenance are required", () => {
  const staleContext = record();
  staleContext.cases[0]!.freshContext = false;
  assert.equal(evaluateGate(skipLinkEntry, staleContext, skipLinkDigests()).verdict, "insufficient_evidence");
  const tuned = record();
  tuned.cases.forEach((item) => { item.independent = false; });
  assert.equal(evaluateGate(skipLinkEntry, tuned, skipLinkDigests()).verdict, "insufficient_evidence");
  const duplicate = record();
  duplicate.cases.push({ ...duplicate.cases[0]! });
  assert.equal(evaluateGate(skipLinkEntry, duplicate, skipLinkDigests()).verdict, "insufficient_evidence");
  assert.equal(evaluateGate(skipLinkEntry, { ...record(), cases: [] }, skipLinkDigests()).verdict, "insufficient_evidence");
});

test("malformed evidence fails closed", () => {
  assert.equal(evaluateGate(skipLinkEntry, { ...record(), cases: null } as unknown as ValidationRecord, skipLinkDigests()).verdict, "insufficient_evidence");
});

test("synthetic reviewer records are explicitly not applied", () => {
  const result = applyReviewerDecision(skipLinkEntry, review(skipLinkDigests()), skipLinkDigests());
  assert.equal(result.applied, false);
  assert.equal(result.reason, "not applied: synthetic reviewer record");
  assert.deepEqual(result.entry, skipLinkEntry);
  assert.equal(isTrustedEligible(result.entry, skipLinkDigests()), false);
});

test("non-synthetic approval branch returns a new trusted entry bound to exact digests", () => {
  // synthetic=false exercises the human-record branch, not evidence of a real sign-off.
  const digests = skipLinkDigests();
  const decision = review(digests, false);
  const result = applyReviewerDecision(skipLinkEntry, decision, digests, eligibleGate());
  assert.equal(result.applied, true);
  assert.notEqual(result.entry, skipLinkEntry);
  assert.equal(result.entry.maturity, "trusted");
  assert.equal(skipLinkEntry.maturity, "candidate");
  assert.equal(isTrustedEligible(result.entry, digests), true);
  assert.equal(entryDigest(result.entry), entryDigest(skipLinkEntry));
});

test("claim or implementation changes invalidate previous approvals and block stale application", () => {
  const digests = skipLinkDigests();
  const decision = review(digests, false);
  const trusted = applyReviewerDecision(skipLinkEntry, decision, digests, eligibleGate()).entry;
  const changedClaim = { ...trusted, claimTemplate: "Changed claim" };
  assert.equal(isTrustedEligible(changedClaim, digests), false);
  const claimDigests = { ...digests, entryDigest: entryDigest(changedClaim) };
  assert.equal(isTrustedEligible(changedClaim, claimDigests), false);
  assert.equal(applyReviewerDecision(changedClaim, decision, claimDigests).applied, false);
  const changedImplementation = { ...digests, implementationDigest: implementationDigest("changed source") };
  assert.equal(isTrustedEligible(trusted, changedImplementation), false);
  assert.equal(applyReviewerDecision(skipLinkEntry, decision, changedImplementation).applied, false);
});

test("non-approvals and synthetic review flags cannot establish trusted eligibility", () => {
  const digests = skipLinkDigests();
  const trusted = applyReviewerDecision(skipLinkEntry, review(digests, false), digests, eligibleGate()).entry;
  for (const decision of ["reject", "needs_changes"] as const) {
    const result = applyReviewerDecision(trusted, { ...review(digests, false), decision }, digests);
    assert.equal(result.entry.maturity, decision === "reject" ? "retired" : "candidate");
    assert.equal(isTrustedEligible(result.entry, digests), false);
  }
  assert.equal(isTrustedEligible({ ...trusted, review: { ...trusted.review!, synthetic: true } }, digests), false);
  assert.equal(isTrustedEligible({ ...trusted, review: null }, digests), false);
  for (const maturity of ["experimental", "candidate", "retired"] as const) assert.equal(isTrustedEligible({ ...trusted, maturity }, digests), false);
});

test("trusted approval requires an eligible gate bound to the same validation record and digests", () => {
  const digests = skipLinkDigests();
  const decision = review(digests, false);
  const denied = (gate?: ReturnType<typeof eligibleGate>) => {
    const result = applyReviewerDecision(skipLinkEntry, decision, digests, gate);
    assert.equal(result.applied, false);
    assert.equal(result.reason, "not applied: validation gate not eligible_for_review");
    assert.equal(result.entry.maturity, "candidate");
  };
  denied();
  const incomplete = record();
  incomplete.cases = [];
  denied({ validationRecord: incomplete, result: evaluateGate(skipLinkEntry, incomplete, digests) });
  const changed = eligibleGate();
  changed.validationRecord.cases[0]!.freshContext = false;
  denied(changed);
  const fabricated = eligibleGate();
  fabricated.validationRecord.cases = [];
  fabricated.result = { ...evaluateGate(skipLinkEntry, fabricated.validationRecord, digests), verdict: "eligible_for_review" };
  denied(fabricated);
  const stale = eligibleGate();
  stale.result.binding.implementationDigest = implementationDigest("other implementation");
  denied(stale);
});
