import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { mineCandidates } from "../src/learning/mine.js";

test("mines repeated cohort patterns and journey gaps without promoting them", async () => {
  const dir = join(tmpdir(), "art-learn-" + randomUUID());
  await mkdir(dir, { recursive: true });
  const source = join(dir, "summary.json");
  const out = join(dir, "candidates.json");

  await writeFile(source, JSON.stringify({
    schema: "art/cohort-result/v1",
    cohortId: "test",
    generatedAt: new Date().toISOString(),
    profileId: "research",
    aiCalls: 0,
    issueFamilies: [
      {
        probeId: "axe.color-contrast",
        outcome: "incomplete",
        municipalityCount: 5,
        occurrenceCount: 100,
        municipalities: ["A", "B", "C", "D", "E"],
      },
      {
        probeId: "axe.image-alt",
        outcome: "violation",
        municipalityCount: 1,
        occurrenceCount: 1,
        municipalities: ["A"],
      },
    ],
    journeyFamilies: [
      {
        journeyId: "keyboard.focus-trace",
        kind: "keyboard_focus",
        outcome: "incomplete",
        municipalityCount: 4,
        resultCount: 8,
        municipalities: ["A", "B", "C", "D"],
      }
    ],
    sites: [],
  }));

  const result = await mineCandidates({
    cohortSummaryPath: source,
    outPath: out,
    minMunicipalities: 2,
    minOccurrences: 3,
  });

  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0]!.status, "CANDIDATE");
  assert.equal(result.candidates[0]!.sourceType, "repeated_incomplete");
  assert.equal(result.candidates[1]!.sourceType, "journey_gap");
  assert.equal(result.candidates[1]!.proposedDetector, "safe_journey");
  assert.equal(result.candidates.every((candidate) => candidate.aiCalls === 0), true);
});
