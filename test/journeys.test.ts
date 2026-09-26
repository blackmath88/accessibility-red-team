import test from "node:test";
import assert from "node:assert/strict";
import { JourneyRunSchema } from "../src/journeys/contracts.js";

test("journey run schema preserves safe interaction invariant", () => {
  const parsed = JourneyRunSchema.parse({
    schema: "art/journey-run/v1",
    generatedAt: new Date().toISOString(),
    surfaceId: "surface_01",
    url: "https://example.com/",
    results: [{
      schema: "art/journey-result/v1",
      journeyId: "skip-link.same-page",
      journeyVersion: "journeys/0.1",
      kind: "skip_link",
      surfaceId: "surface_01",
      url: "https://example.com/",
      outcome: "pass",
      title: "Skip link target",
      summary: "ok",
      evidence: [],
      safety: {
        submittedForms: false,
        followedExternalLinks: false,
        wroteServerState: false,
      },
      aiCalls: 0,
    }],
    aiCalls: 0,
  });

  assert.equal(parsed.results[0]!.safety.submittedForms, false);
  assert.equal(parsed.results[0]!.safety.wroteServerState, false);
});
