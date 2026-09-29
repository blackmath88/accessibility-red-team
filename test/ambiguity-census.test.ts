import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { AXE_INCOMPLETE_MODALITY, buildCensus, modalityOf, readEvidenceFiles, siteOf } from "../src/evaluation/ambiguity-census.js";

const probe = (probeId: string, outcome: string, nodes: number) => ({ schema: "art/probe-result/v1", probeId, outcome, nodes: Array.from({ length: nodes }, () => ({})) });
const journey = (journeyId: string, outcome: string, summary: string) => ({ journeyId, outcome, summary });

// Frozen pilot-shaped tree: sites/<id>/{baseline-axe,deterministic-observatory/...}
async function pilotTree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "census-"));
  const files: Record<string, unknown> = {};
  for (const site of ["ch-a", "ch-b", "ch-c"]) {
    const obs = `sites/${site}/deterministic-observatory`;
    files[`sites/${site}/baseline-axe/axe-results.json`] = { violations: [], incomplete: [{ id: "color-contrast", nodes: [{}, {}] }] };
    files[`${obs}/surface.json`] = { schema: "art/accessibility-surface/v1", surfaces: [{ kind: "home" }, { kind: site === "ch-c" ? "unknown" : "service" }] };
    files[`${obs}/surfaces/s1/probe-results.json`] = [probe("color-contrast", "incomplete", 5), probe("label-content-name-mismatch", "incomplete", 2), probe("image-alt", "violation", 3)];
    files[`${obs}/surfaces/s1/journey-results.json`] = { results: [journey("skip-link.same-page", "incomplete", "target not focused"), journey("keyboard.focus-trace", "pass", "ok")] };
  }
  files["sites/ch-c/deterministic-observatory/surfaces/s2/probe-results.json"] = "{not json";
  for (const [path, value] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), typeof value === "string" ? value : JSON.stringify(value));
  }
  return root;
}

test("census counts unresolved evidence by source, rule, modality, journey and surface kind", async () => {
  const census = buildCensus(await readEvidenceFiles(await pilotTree()), "2026-09-29T00:00:00.000Z");
  assert.equal(census.aiCalls, 0);
  assert.equal(census.sites, 3);
  assert.deepEqual(census.scannedFiles, { baseline_axe: 3, observatory_probe: 3, journey: 3, surface: 3, skipped: 1 });
  const obsContrast = census.axeIncomplete.rules.find((r) => r.source === "observatory_probe" && r.ruleId === "color-contrast");
  assert.deepEqual(obsContrast, { source: "observatory_probe", ruleId: "color-contrast", modality: "visual_rendering", results: 3, nodes: 15, sites: 3 });
  assert.ok(!census.axeIncomplete.rules.some((r) => r.ruleId === "image-alt"), "violations are not unresolved evidence");
  assert.equal(census.axeIncomplete.observatoryUnresolvedNodes, 21);
  assert.deepEqual(census.axeIncomplete.observatoryByModality.visual_rendering, { nodes: 15, share: 0.714 });
  assert.deepEqual(census.axeIncomplete.observatoryByModality.text_semantic, { nodes: 6, share: 0.286 });
  const skip = census.journeys.find((j) => j.journeyId === "skip-link.same-page");
  assert.deepEqual(skip, { journeyId: "skip-link.same-page", sites: 3, outcomes: { incomplete: 3 }, topIncompleteReasons: [{ summary: "target not focused", count: 3 }] });
  assert.deepEqual(census.surfaces, { selected: 6, byKind: { home: 3, service: 2, unknown: 1 }, unknownShare: 0.167 });
});

test("re-entry frequency gate needs a text-semantic rule with enough share and sites", async () => {
  const census = buildCensus(await readEvidenceFiles(await pilotTree()));
  assert.deepEqual(census.semanticReentry.textSemanticCandidates, [{ ruleId: "label-content-name-mismatch", nodes: 6, sites: 3, share: 0.286, meetsGate: true }]);
  assert.equal(census.semanticReentry.frequencyGateMet, true);
  const visualOnly = buildCensus([{ path: "sites/x/a/probe-results.json", json: [probe("color-contrast", "incomplete", 9)] }]);
  assert.equal(visualOnly.semanticReentry.frequencyGateMet, false, "visual-only ambiguity never opens the text-model gate");
  const rare = buildCensus([{ path: "sites/x/a/probe-results.json", json: [probe("color-contrast", "incomplete", 20), probe("p-as-heading", "incomplete", 1)] }]);
  assert.equal(rare.semanticReentry.frequencyGateMet, false);
});

test("census is deterministic and conservative about unknown rules and layouts", async () => {
  const files = await readEvidenceFiles(await pilotTree());
  assert.deepEqual(buildCensus(files, "t"), buildCensus([...files].reverse(), "t"));
  assert.equal(modalityOf("some-future-rule"), "unclassified");
  assert.ok(Object.values(AXE_INCOMPLETE_MODALITY).every((m) => m !== "unclassified"));
  assert.equal(siteOf("sites/ch-zh-uster/deterministic-observatory/surface.json"), "ch-zh-uster");
  assert.equal(siteOf("surfaces/s1/probe-results.json"), "(single-site run)");
});
