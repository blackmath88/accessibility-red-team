import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { compareSiteReports } from "../src/watch/compare.js";

function finding(probeId: string, probeVersion = "axe-core/4.13", prevalence = 0.5) {
  return {
    finding: {
      schema: "art/evidence-finding/v1",
      findingId: "x",
      probeId,
      probeVersion,
      outcome: "violation",
      impact: "serious",
      help: probeId,
      helpUrl: "https://example.com/help",
      tags: [],
      requirements: [],
      affectedSurfaces: 1,
      occurrenceCount: 1,
      prevalence,
      templateLeverage: "single_surface",
      occurrences: [],
    },
    requirements: [],
  };
}

function report(profileId: string, findings: ReturnType<typeof finding>[]) {
  return {
    schema: "art/site-accessibility-report/v1",
    generatedAt: new Date().toISOString(),
    profileId,
    entrypoint: "https://example.com/",
    totalSurfaces: 2,
    summary: {
      findings: findings.length,
      repeatedFindings: 0,
      applicableFindings: 0,
      needsReview: 0,
    },
    findings,
    aiCalls: 0,
  };
}

test("classifies new, persisting and resolved findings", async () => {
  const dir = join(tmpdir(), "art-watch-" + randomUUID());
  await mkdir(dir, { recursive: true });
  const previous = join(dir, "previous.json");
  const current = join(dir, "current.json");
  const out = join(dir, "watch.json");

  await writeFile(previous, JSON.stringify(report("profile", [
    finding("axe.old"),
    finding("axe.same"),
  ])));
  await writeFile(current, JSON.stringify(report("profile", [
    finding("axe.same", "axe-core/4.13", 1),
    finding("axe.new"),
  ])));

  const result = await compareSiteReports({ previousPath: previous, currentPath: current, outPath: out });
  assert.equal(result.summary.new, 1);
  assert.equal(result.summary.persisting, 1);
  assert.equal(result.summary.resolved, 1);
});

test("fails comparison closed when the jurisdiction profile changes", async () => {
  const dir = join(tmpdir(), "art-watch-" + randomUUID());
  await mkdir(dir, { recursive: true });
  const previous = join(dir, "previous.json");
  const current = join(dir, "current.json");
  const out = join(dir, "watch.json");

  await writeFile(previous, JSON.stringify(report("old-profile", [finding("axe.same")])));
  await writeFile(current, JSON.stringify(report("new-profile", [finding("axe.same")])));

  const result = await compareSiteReports({ previousPath: previous, currentPath: current, outPath: out });
  assert.equal(result.comparable, false);
  assert.equal(result.summary.notComparable, 1);
});
