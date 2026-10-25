import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { DEFAULT_CONDITION } from "../src/experimental/adaptive/contracts.js";
import { runSession } from "../src/experimental/adaptive/executor.js";
import { CONDITIONS, runLocalComparison } from "../src/experimental/adaptive/frontier-compare.js";
import { scoreSession } from "../src/experimental/adaptive/funnel.js";
import { FakeProvider, type FakeScript } from "../src/experimental/adaptive/providers/fake.js";
import { FIXTURE_DIR, loadTruth } from "./fixtures/adaptive-sites/server.js";
import { DEV_VARIANTS, FRONTIER_DEV_FIXTURES, heldOutVariants, loadDevTruth } from "./fixtures/adaptive-sites/variants.js";
import { fixtureConfig, linkTo, startHarness, type Harness } from "./adaptive-helpers.js";

let harness: Harness;
before(async () => { harness = await startHarness(); });
after(async () => { await harness.close(); });

describe("funnel scoring", () => {
  it("trial-3 pattern: visiting the working sibling and finishing 'complete' credits nothing and counts as premature", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "art-adaptive-"));
    const script: FakeScript = ({ call, observation }) => call === 0
      ? { action: { type: "navigate", url: linkTo(observation, "/valid.html") } }
      : { action: { type: "finish", verdict: "complete", summary: "everything tested", candidates: [] } };
    try {
      await runSession({ config: fixtureConfig(harness, "/skip-links/index.html"), provider: new FakeProvider(script), outDir, browser: harness.browser, codeSha: "test" });
      const row = await scoreSession(outDir, await loadTruth("skip-links"), "A", DEFAULT_CONDITION.sampling.maxPagesPerSource);
      const defect = row.defects[0]!;
      assert.deepEqual(defect.exploration, { discovered: true, modelVisible: true, selected: false, visited: false, probeExecuted: false });
      assert.deepEqual(defect.interpretation, { interpreted: false, reported: false });
      assert.equal(defect.credited, false);
      assert.equal(row.prematureCompletion, true);
      assert.equal(row.completionOutcome, "partial");
      assert.equal(row.comparable, true);
    } finally { await rm(outDir, { recursive: true, force: true }); }
  });

  it("the local runner writes per-session frontier.json, funnel.json and comparison.md, and D is credited on the neutral sibling variant", async () => {
    const outRoot = await mkdtemp(join(tmpdir(), "art-frontier-"));
    try {
      const result = await runLocalComparison({ outRoot, id: "t", fixtures: ["dev-k1"], conditions: ["A-standin", "D"] });
      for (const label of ["A-standin", "D"]) await readFile(join(result.dir, "dev-k1", label, "frontier.json"), "utf8");
      const funnel = JSON.parse(await readFile(join(result.dir, "funnel.json"), "utf8")) as { rows: Array<{ condition: string; defects: Array<{ credited: boolean }> }> };
      assert.deepEqual(funnel.rows.map((row) => row.condition), ["A-standin", "D"]);
      assert.equal(funnel.rows[1]!.defects[0]!.credited, true);
      assert.match(result.markdown, /Historical live trials 1–3/);
      assert.match(result.markdown, /Pending API comparisons/);
      assert.match(result.markdown, /stand-in for a model/);
      assert.doesNotMatch(result.markdown, /127\.0\.0\.1|localhost|:\d{4,5}\//, "paths only, never origins");
      assert.equal(CONDITIONS.D.selector, "scheduler");
    } finally { await rm(outRoot, { recursive: true, force: true }); }
  });
});

describe("development fixture variants", () => {
  it("are labelled development, use neutral paths and link text, and keep truth unreachable", async () => {
    const context = await harness.browser.newContext();
    try {
      const page = await context.newPage();
      for (const name of DEV_VARIANTS) {
        const truth = await loadDevTruth(name);
        assert.equal(truth.split, "development", name);
        assert.equal(truth.heldOut, false, name);
        for (const path of truth.surfaces) assert.doesNotMatch(path, /broken|valid|defekt|fehler|error|bad|good/i, path);
        const files = (await readdir(join(FIXTURE_DIR, name), { recursive: true })).filter((file) => file.endsWith(".html"));
        for (const file of files) {
          const html = await readFile(join(FIXTURE_DIR, name, file), "utf8");
          const visible = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
          assert.doesNotMatch(visible, /defekt|kaputt|fehlerhaft|gültig|broken|valid|seeded/i, `${name}/${file}`);
        }
        assert.equal((await page.goto(`${harness.fixtures.origin}/${name}/truth.json`))?.status(), 404, name);
      }
    } finally { await context.close(); }
  });

  it("place the defect at different positions and include working controls", async () => {
    const k1 = await loadDevTruth("dev-k1");
    assert.equal(k1.surfaces.indexOf(k1.defects[0]!.path), 3, "third sibling after the start page");
    const k3 = await loadDevTruth("dev-k3");
    assert.ok(k3.detectorTraps.some((trap) => trap.id === "k3-first-dialog-works"));
    assert.ok((FRONTIER_DEV_FIXTURES as readonly string[]).every((name) => name !== "heldout-menus" && name !== "malicious"));
  });

  it("the held-out generator is a stub that refuses without an owner-supplied seed", () => {
    assert.throws(() => heldOutVariants({}), /owner-supplied seed/);
  });
});
