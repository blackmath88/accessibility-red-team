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

function reportV1(profileId: string, findings: ReturnType<typeof finding>[]) {
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

function reportV2(
  profileId: string,
  findings: ReturnType<typeof finding>[],
  journeys: Array<{
    journeyId: string;
    journeyVersion: string;
    kind: string;
    outcome: "pass" | "violation" | "incomplete" | "inapplicable" | "error";
    affectedSurfaces: number;
    resultCount: number;
    surfaceIds: string[];
    summaries: string[];
  }>,
) {
  return {
    schema: "art/site-accessibility-report/v2",
    generatedAt: new Date().toISOString(),
    profileId,
    entrypoint: "https://example.com/",
    totalSurfaces: 2,
    summary: {
      findings: findings.length,
      repeatedFindings: 0,
      applicableFindings: 0,
      needsReview: 0,
      journeyPasses: journeys.filter((x) => x.outcome === "pass").length,
      journeyNeedsReview: journeys.filter((x) => x.outcome === "incomplete").length,
      journeyViolations: journeys.filter((x) => x.outcome === "violation").length,
    },
    findings,
    journeys,
    aiCalls: 0,
  };
}

function journey(outcome: "pass" | "incomplete", version = "journeys/0.1") {
  return {
    journeyId: "keyboard.focus-trace",
    journeyVersion: version,
    kind: "keyboard_focus",
    outcome,
    affectedSurfaces: 2,
    resultCount: 2,
    surfaceIds: ["a", "b"],
    summaries: [outcome],
  };
}

test("classifies new, persisting and resolved static findings", async () => {
  const dir = join(tmpdir(), "art-watch-" + randomUUID());
  await mkdir(dir, { recursive: true });
  const previous = join(dir, "previous.json");
  const current = join(dir, "current.json");
  const out = join(dir, "watch.json");

  await writeFile(previous, JSON.stringify(reportV1("profile", [
    finding("axe.old"),
    finding("axe.same"),
  ])));
  await writeFile(current, JSON.stringify(reportV1("profile", [
    finding("axe.same", "axe-core/4.13", 1),
    finding("axe.new"),
  ])));

  const result = await compareSiteReports({ previousPath: previous, currentPath: current, outPath: out });
  assert.equal(result.summary.new, 1);
  assert.equal(result.summary.persisting, 1);
  assert.equal(result.summary.resolved, 1);
  assert.equal(result.journeys.length, 0);
});

test("fails comparison closed when the jurisdiction profile changes", async () => {
  const dir = join(tmpdir(), "art-watch-" + randomUUID());
  await mkdir(dir, { recursive: true });
  const previous = join(dir, "previous.json");
  const current = join(dir, "current.json");
  const out = join(dir, "watch.json");

  await writeFile(previous, JSON.stringify(reportV1("old-profile", [finding("axe.same")])));
  await writeFile(current, JSON.stringify(reportV1("new-profile", [finding("axe.same")])));

  const result = await compareSiteReports({ previousPath: previous, currentPath: current, outPath: out });
  assert.equal(result.comparable, false);
  assert.equal(result.summary.notComparable, 1);
});

test("tracks journey outcome changes independently from static findings", async () => {
  const dir = join(tmpdir(), "art-watch-" + randomUUID());
  await mkdir(dir, { recursive: true });
  const previous = join(dir, "previous.json");
  const current = join(dir, "current.json");
  const out = join(dir, "watch.json");

  await writeFile(previous, JSON.stringify(reportV2("profile", [], [journey("incomplete")])));
  await writeFile(current, JSON.stringify(reportV2("profile", [], [journey("pass")])));

  const result = await compareSiteReports({ previousPath: previous, currentPath: current, outPath: out });
  assert.equal(result.summary.journeyChanged, 1);
  assert.equal(result.journeys[0]!.state, "OUTCOME_CHANGED");
  assert.deepEqual(result.journeys[0]!.previous?.outcomes, ["incomplete"]);
  assert.deepEqual(result.journeys[0]!.current?.outcomes, ["pass"]);
});

test("marks journey version changes separately", async () => {
  const dir = join(tmpdir(), "art-watch-" + randomUUID());
  await mkdir(dir, { recursive: true });
  const previous = join(dir, "previous.json");
  const current = join(dir, "current.json");
  const out = join(dir, "watch.json");

  await writeFile(previous, JSON.stringify(reportV2("profile", [], [journey("pass", "journeys/0.1")])));
  await writeFile(current, JSON.stringify(reportV2("profile", [], [journey("pass", "journeys/0.2")])));

  const result = await compareSiteReports({ previousPath: previous, currentPath: current, outPath: out });
  assert.equal(result.summary.journeyRuleChanged, 1);
  assert.equal(result.journeys[0]!.state, "RULE_CHANGED");
});
