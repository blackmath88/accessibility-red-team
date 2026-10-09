import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { triageSurfaceRuns } from "../src/triage/triage.js";
import { buildSiteReport } from "../src/report/site.js";
import { createEmitter, TheatreEventSchema, type TheatreEvent } from "../src/theatre/emit.js";

// Recorded real cohort run (npm run cohort -- cohorts/zh-small-pilot.yml --out <dir>): events.jsonl + summary.json.
const RECORDED = "theatre/runs/zh-small-pilot-2026-10-09";

const modelEvents = (events: TheatreEvent[]) => events.filter((e) => e.actor !== "code" && e.actor !== "human");

function assertModelEventsCarryCost(events: TheatreEvent[]) {
  for (const event of modelEvents(events)) {
    assert.ok(event.cost?.tokens !== undefined || event.cost?.usd !== undefined, `model event without cost: ${event.subject.id}`);
    if (event.stage === "interpret") assert.equal(event.actor, "small-model");
  }
}

test("recorded cohort run: every event is valid and manifest aiCalls equals model events", async () => {
  const lines = (await readFile(`${RECORDED}.events.jsonl`, "utf8")).trim().split("\n");
  const events = lines.map((line) => TheatreEventSchema.parse(JSON.parse(line)));
  const summary = JSON.parse(await readFile(`${RECORDED}.summary.json`, "utf8"));

  assert.equal(summary.aiCalls, modelEvents(events).length);
  assertModelEventsCarryCost(events);
  assert.ok(events.every((e) => e.run === summary.cohortId));
  assert.deepEqual(events.map((e) => e.ts), [...events.map((e) => e.ts)].sort());

  const reported = events.filter((e) => e.stage === "report" && e.verdict === "written").length;
  assert.equal(reported, summary.sites.filter((site: { status: string }) => site.status === "PASS").length);
  const findings = events.filter((e) => e.stage === "triage" && e.verdict === "finding").length;
  assert.equal(findings, summary.sites.reduce((n: number, site: { findings?: number }) => n + (site.findings ?? 0), 0));
});

test("triage → site report emits events that reconcile with outputs and aiCalls", async () => {
  const root = join(tmpdir(), "art-theatre-" + randomUUID());
  const probe = (probeId: string, outcome: string, nodes: number) => ({
    schema: "art/probe-result/v1", probeId, probeVersion: "axe-core/4.13", surfaceId: "x", stateId: "initial",
    outcome, impact: "serious", help: probeId, helpUrl: "https://example.com/help",
    tags: ["wcag2a", "wcag412"], requirements: [{ framework: "WCAG", criterion: "4.1.2", sourceTag: "wcag412" }],
    nodes: Array.from({ length: nodes }, (_, i) => ({ target: [`#n${i}`], html: "<input>", failureSummary: null })),
  });
  const surfaces = [
    { surfaceId: "surface_01", url: "https://www.example.ch/", probes: [probe("axe.label", "violation", 2), probe("axe.image-alt", "pass", 3)] },
    { surfaceId: "surface_02", url: "https://www.example.ch/form", probes: [probe("axe.label", "violation", 1), probe("axe.region", "incomplete", 1)] },
  ];
  for (const surface of surfaces) {
    await mkdir(join(root, surface.surfaceId), { recursive: true });
    await writeFile(join(root, surface.surfaceId, "probe-results.json"), JSON.stringify(surface.probes));
  }
  await writeFile(join(root, "surface.json"), JSON.stringify({
    schema: "art/accessibility-surface/v1", entrypoint: "https://www.example.ch/", finalEntrypoint: "https://www.example.ch/",
    discoveredAt: new Date().toISOString(), strategy: { mode: "broad", maxPages: 2, maxDepth: 1, reason: "test" },
    discoveredPages: 2, surfaces: [],
  }));

  const events: TheatreEvent[] = [];
  const emit = createEmitter({ run: "acceptance", sink: (line) => events.push(JSON.parse(line)) });
  const triage = await triageSurfaceRuns(
    surfaces.map((s) => ({ surfaceId: s.surfaceId, url: s.url, runDir: join(root, s.surfaceId) })),
    join(root, "findings.json"),
    emit,
  );
  const report = await buildSiteReport({ auditDir: root, profilePath: "requirements/profiles/ch.zh.municipal-research.yml", emit });

  const count = (stage: string, verdict: string) => events.filter((e) => e.stage === stage && e.verdict === verdict).length;
  assert.equal(count("triage", "finding"), triage.findings.length);
  assert.equal(count("triage", "finding") + count("triage", "merged"), triage.findings.reduce((n, f) => n + f.occurrenceCount, 0));
  assert.equal(count("triage", "dropped"), 1);
  assert.equal(count("verify", "supported") + count("verify", "blocked"), report.findings.reduce((n, f) => n + f.requirements.length, 0));
  assert.equal(count("report", "written"), 1);
  assert.equal(triage.aiCalls + report.aiCalls, modelEvents(events).length);
  assertModelEventsCarryCost(events);
});
