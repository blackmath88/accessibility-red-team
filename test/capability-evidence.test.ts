import assert from "node:assert/strict";
import test from "node:test";

import { capabilityEvidenceFromJourneyRuns } from "../src/capability-evidence.js";
import { JourneyRunSchema } from "../src/journeys/contracts.js";

test("keyboard focus journey produces observed WCAG 2.4.3 capability evidence", () => {
  const run = JourneyRunSchema.parse({
    schema: "art/journey-run/v1",
    generatedAt: "2026-09-26T00:00:00.000Z",
    surfaceId: "surface_root",
    url: "https://example.com/",
    aiCalls: 0,
    results: [{
      schema: "art/journey-result/v1",
      journeyId: "keyboard-focus-trace",
      journeyVersion: "1",
      kind: "keyboard_focus",
      surfaceId: "surface_root",
      url: "https://example.com/",
      outcome: "incomplete",
      title: "Keyboard focus trace",
      summary: "Focus order requires review.",
      evidence: [{ action: "Tab", selector: "a:first-of-type", note: "first focus target" }],
      safety: { submittedForms: false, followedExternalLinks: false, wroteServerState: false },
      aiCalls: 0,
    }],
  });

  const evidence = capabilityEvidenceFromJourneyRuns([run]);

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].criterion, "2.4.3");
  assert.equal(evidence[0].mode, "BEHAVIORAL");
  assert.equal(evidence[0].outcome, "incomplete");
  assert.equal(evidence[0].evidenceCount, 1);
});

test("unmapped journeys do not invent requirement evidence", () => {
  const run = JourneyRunSchema.parse({
    schema: "art/journey-run/v1",
    generatedAt: "2026-09-26T00:00:00.000Z",
    surfaceId: "surface_root",
    url: "https://example.com/",
    aiCalls: 0,
    results: [{
      schema: "art/journey-result/v1",
      journeyId: "dialog-focus",
      journeyVersion: "1",
      kind: "dialog",
      surfaceId: "surface_root",
      url: "https://example.com/",
      outcome: "pass",
      title: "Dialog",
      summary: "Dialog focus behavior passed.",
      evidence: [],
      safety: { submittedForms: false, followedExternalLinks: false, wroteServerState: false },
      aiCalls: 0,
    }],
  });

  assert.deepEqual(capabilityEvidenceFromJourneyRuns([run]), []);
});
