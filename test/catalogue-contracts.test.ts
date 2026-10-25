import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CandidateCheckSchema } from "../src/learning/contracts.js";
import { entryDigest, implementationDigest, isTrustedEligible, ProbeEntrySchema, ProbeMaturitySchema, GateVerdictSchema } from "../src/catalogue/contracts.js";
import { candidateStatusToMaturity, probeRegistry, skipLinkDigests, skipLinkEntry } from "../src/catalogue/registry.js";

test("exactly one typed candidate entry preserves bounded claim and abstention semantics", () => {
  assert.equal(probeRegistry.length, 1);
  assert.equal(ProbeEntrySchema.parse(probeRegistry[0]).probeId, "skip-link.same-page");
  assert.equal(skipLinkEntry.maturity, "candidate");
  assert.equal(skipLinkEntry.review, null);
  assert.deepEqual(skipLinkEntry.outcomes, { pass: "no_claim", violation: "claim", incomplete: "abstain", inapplicable: "abstain", error: "abstain" });
  assert.deepEqual(ProbeMaturitySchema.options, ["experimental", "candidate", "trusted", "retired"]);
  assert.deepEqual(GateVerdictSchema.options, ["eligible_for_review", "rejected", "insufficient_evidence"]);
  assert.equal(isTrustedEligible(skipLinkEntry, skipLinkDigests()), false);
  assert.match(skipLinkEntry.limitations.join(" "), /20 fragment links/);
  assert.match(skipLinkEntry.limitations.join(" "), /WCAG conformance/);
  assert.ok(CandidateCheckSchema.shape.sourceType.safeParse(skipLinkEntry.originHypothesis.sourceType).success);
});

test("legacy candidate status mapping cannot manufacture trusted eligibility", () => {
  assert.equal(candidateStatusToMaturity("OBSERVED"), "experimental");
  for (const status of ["CANDIDATE", "VALIDATED", "PROMOTED"]) assert.equal(candidateStatusToMaturity(status), "candidate");
  for (const status of ["REJECTED", "DEPRECATED"]) assert.equal(candidateStatusToMaturity(status), "retired");
  assert.throws(() => candidateStatusToMaturity("trusted"));
});

test("entry digest canonicalizes object keys, excludes only maturity and review, and binds claim changes", () => {
  const reordered = Object.fromEntries(Object.entries(skipLinkEntry).reverse()) as typeof skipLinkEntry;
  assert.equal(entryDigest(reordered), entryDigest(skipLinkEntry));
  assert.equal(entryDigest({ ...skipLinkEntry, maturity: "trusted" }), entryDigest(skipLinkEntry));
  assert.notEqual(entryDigest({ ...skipLinkEntry, claimTemplate: "A broader claim" }), entryDigest(skipLinkEntry));
  assert.notEqual(entryDigest({ ...skipLinkEntry, implementationVersion: "next" }), entryDigest(skipLinkEntry));
  assert.notEqual(entryDigest({ ...skipLinkEntry, limitations: [] }), entryDigest(skipLinkEntry));
});

test("implementation digest hashes actual skip-link source text", () => {
  const source = readFileSync(new URL("../src/journeys/skip-link.ts", import.meta.url), "utf8");
  assert.equal(skipLinkDigests().implementationDigest, implementationDigest(source));
  assert.notEqual(implementationDigest(`${source}\n// changed`), implementationDigest(source));
  assert.equal(implementationDigest("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
