import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { skipLinkJourney } from "../src/journeys/skip-link.js";
import { runSkipLinkProbe, skipLinkDigests, skipLinkEntry } from "../src/catalogue/registry.js";
import { challengeCounts, evaluateGate, type ChallengeCase } from "../src/promotion/gate.js";
import { challengeCases } from "./fixtures/skip-link-probe/cases.js";

test("real skip-link challenges use fresh contexts and preserve expected outcomes and summaries", async (t) => {
  const browser = await chromium.launch({ headless: true });
  const cases: ChallengeCase[] = [];
  try {
    for (const fixture of challengeCases) {
      await t.test(fixture.file, async () => {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          // file:// fixtures perform no public network access.
          const url = new URL(`./fixtures/skip-link-probe/${fixture.file}.html`, import.meta.url).href;
          await page.goto(url);
          const wrapped = await runSkipLinkProbe(page, "fixture", url);
          const direct = await skipLinkJourney(page, "fixture", url);
          assert.deepEqual(wrapped.result, direct);
          assert.equal(wrapped.result.outcome, fixture.expected);
          assert.equal(wrapped.result.summary, fixture.summary);
          assert.equal(wrapped.result.journeyId, "skip-link.same-page");
          assert.equal(wrapped.result.aiCalls, 0);
          assert.deepEqual(wrapped.result.safety, { submittedForms: false, followedExternalLinks: false, wroteServerState: false });
          assert.equal(wrapped.probeId, skipLinkEntry.probeId);
          assert.deepEqual({ entryDigest: wrapped.entryDigest, implementationDigest: wrapped.implementationDigest }, skipLinkDigests());
          cases.push({ caseId: fixture.file, category: fixture.category, expected: fixture.expected, actual: wrapped.result.outcome, supported: true, freshContext: true, independent: fixture.category === "independent_structure" });
        } finally {
          await context.close();
        }
      });
    }
    const counts = challengeCounts(cases);
    assert.deepEqual(counts, { cases: 6, falsePositives: 0, falseNegatives: 0, abstentions: 3, unsupported: 0, unexpectedErrors: 0 });
    const gate = evaluateGate(skipLinkEntry, { schema: "art/probe-validation/v1", probeId: skipLinkEntry.probeId, ...skipLinkDigests(), cases }, skipLinkDigests());
    assert.equal(gate.verdict, "eligible_for_review");
    assert.equal(skipLinkEntry.maturity, "candidate");
    assert.equal(skipLinkEntry.review, null);
    t.diagnostic(JSON.stringify({ challengeResults: cases, counts, gate }));
  } finally {
    await browser.close();
  }
});

test("malformed percent encoding yields explicit abstention rather than escaping or violation", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent('<a href="#%E0%A4%A">Skip to content</a>');
    const result = await skipLinkJourney(page, "regression", "https://fixture.invalid/");
    assert.equal(result.outcome, "incomplete");
    assert.match(result.summary, /fragment could not be decoded/);
    assert.equal(result.evidence[0]?.before?.href, "#%E0%A4%A");
  } finally {
    await context.close();
    await browser.close();
  }
});

test("bounded sampling and first recognizable link behavior are unchanged", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const { html, expected } of [
      { html: `${'<a href="#decoy">Other</a>'.repeat(20)}<a href="#missing">Skip</a>`, expected: "inapplicable" },
      { html: `${'<a href="#decoy">Other</a>'.repeat(19)}<a href="#missing">Skip</a>`, expected: "violation" },
      { html: '<a href="#main">Skip</a><a href="#missing">Skip</a><main id="main"></main>', expected: "pass" },
      { html: '<a href="#">Skip</a><a href="#m%C3%A4in">Jump</a><main id="mäin"></main>', expected: "pass" },
    ]) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await page.setContent(html);
        assert.equal((await skipLinkJourney(page, "bounds", "https://fixture.invalid/")).outcome, expected);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
});
