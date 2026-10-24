import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { runArmA, runArmB, sealArm, SealError, verifySeal } from "../src/experimental/adaptive/arms.js";
import { runTrial, type TrialResult } from "../src/experimental/adaptive/cli.js";
import { HypothesisSchema, observe } from "../src/experimental/adaptive/observer.js";
import { FakeProvider } from "../src/experimental/adaptive/providers/fake.js";
import { exploratoryScript } from "../src/experimental/adaptive/scripted-policy.js";
import { loadTruth, type FixtureName } from "./fixtures/adaptive-sites/server.js";

let root: string;
let trial: TrialResult;
const by = (name: FixtureName) => trial.comparisons.find((comparison) => comparison.fixture === name)!;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "art-adaptive-trial-"));
  trial = await runTrial({ outRoot: root, id: "t" });
}, { timeout: 120_000 });
after(async () => { await rm(root, { recursive: true, force: true }); });

describe("arm sealing", () => {
  it("every arm of the trial is sealed and verifies after comparison", async () => {
    for (const comparison of trial.comparisons) {
      for (const arm of ["A", "B"] as const) {
        const seal = await verifySeal(join(trial.dir, comparison.fixture, arm));
        assert.equal(seal.rootSha256, comparison[arm].sealRootSha256);
      }
    }
  });
  it("detects modified, added and missing files, and refuses unsealed directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "art-seal-"));
    try {
      await runArmB("skip-links", "/skip-links/index.html", { outDir: dir });
      await assert.rejects(verifySeal(dir), SealError, "unsealed");
      await assert.rejects(observe(dir, dir), SealError, "observer refuses unsealed arms");
      await sealArm(dir, "B");
      await verifySeal(dir);
      await appendFile(join(dir, "session", "trace.jsonl"), " ");
      await assert.rejects(verifySeal(dir), /modified: session\/trace.jsonl/);
      await writeFile(join(dir, "session", "trace.jsonl"), await readFile(join(trial.dir, "skip-links", "B", "session", "trace.jsonl")));
      await assert.rejects(verifySeal(dir), SealError);
      await unlink(join(dir, "session", "denials.json"));
      await assert.rejects(verifySeal(dir), /missing: session\/denials.json/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

describe("arm independence", () => {
  it("arm B never sees anything from arm A", async () => {
    const dirA = join(root, "indep", "A");
    const dirB = join(root, "indep", "B");
    const a = await runArmA("skip-links", "/skip-links/index.html", { outDir: dirA });
    const sealA = await sealArm(dirA, "A");
    const inner = new FakeProvider(exploratoryScript());
    await runArmB("skip-links", "/skip-links/index.html", { outDir: dirB, provider: inner });
    const prompts = inner.requests.flatMap((request) => request.messages.map((message) => message.content)).join("\n");
    for (const secret of [sealA.rootSha256, dirA, "probe-results", "surface-0", "axe.", a.findings[0]!.id, "A.0."]) assert.ok(!prompts.includes(secret), `B prompt leaked ${secret}`);
    assert.equal(a.pinned.modelId, null);
    assert.equal(JSON.parse(await readFile(join(dirB, "arm.json"), "utf8")).pinned.modelId, "fake-scripted-v1");
  });
  it("both arms pin code, configuration and limits", () => {
    for (const comparison of trial.comparisons) {
      for (const arm of ["A", "B"] as const) {
        assert.match(comparison.pinned[arm].configHash, /^[a-f0-9]{64}$/);
        assert.ok(comparison.pinned[arm].codeSha.length > 0);
      }
      assert.equal(comparison.pinned.B.skillVersion, "adaptive-a11y-skill/v1");
    }
  });
});

describe("comparison against fixture truth", () => {
  it("the dynamic arm reaches a state the baseline missed (menu-only service form)", async () => {
    const truth = await loadTruth("news-service");
    const c = by("news-service");
    assert.deepEqual(c.A.hiddenSurfacesReached, []);
    assert.deepEqual(c.B.hiddenSurfacesReached.sort(), [...truth.hiddenSurfaces].sort());
    assert.deepEqual(c.dynamicAdvantage.statesOnlyB, ["menu-open"]);
    assert.deepEqual(c.B.verifiedDefects, ["news-plz-unlabeled"]);
    assert.deepEqual(c.A.verifiedDefects, []);
    assert.ok(c.dynamicAdvantage.reachedStateBaselineMissed);
  });
  it("menu/dialog: B verifies the dialog focus defect; the baseline exercised the wrong control", () => {
    const c = by("menu-dialog");
    assert.deepEqual(c.B.verifiedDefects, ["menu-dialog-focus-not-returned"]);
    assert.deepEqual(c.A.missedDefects, ["menu-dialog-focus-not-returned"]);
    assert.deepEqual(c.B.truthStatesReached.sort(), ["dialog-open", "menu-open"]);
  });
  it("the baseline is not worse everywhere: skip links are found by both, repeated component is sampled narrower by A", () => {
    const skip = by("skip-links");
    assert.deepEqual(skip.A.verifiedDefects, ["skip-broken-target"]);
    assert.deepEqual(skip.B.verifiedDefects, ["skip-broken-target"]);
    assert.equal(skip.dynamicAdvantage.reachedStateBaselineMissed, false);
    const repeated = by("repeated-component");
    assert.deepEqual(repeated.A.verifiedDefects, ["icon-search-unnamed"]);
    assert.deepEqual(repeated.B.verifiedDefects, ["icon-search-unnamed"]);
    assert.equal(repeated.B.occurrencesPerDefect["icon-search-unnamed"], 4);
    assert.ok(repeated.A.occurrencesPerDefect["icon-search-unnamed"]! < 4, "A's structural-fingerprint sampling skips repeated pages");
    assert.ok(repeated.A.duplicates >= 1, "A reports each occurrence separately");
    assert.equal(repeated.B.duplicates, 0, "B consolidates the repeated component into one finding");
  });
  it("no arm produced a false alarm in a category fixture truth speaks about", () => {
    for (const c of trial.comparisons) { assert.deepEqual(c.A.falseAlarms, [], `${c.fixture} A`); assert.deepEqual(c.B.falseAlarms, [], `${c.fixture} B`); }
  });
  it("nothing off-origin or non-GET ever reached a server in either arm; denials are reported separately from findings", () => {
    for (const c of trial.comparisons) {
      for (const arm of ["A", "B"] as const) { assert.equal(c[arm].offOriginRequests, 0, `${c.fixture} ${arm}`); assert.equal(c[arm].nonGetRequests, 0, `${c.fixture} ${arm}`); }
    }
    const m = by("malicious");
    assert.ok(Object.keys(m.B.deniedActions).length >= 5);
    assert.ok((m.A.deniedActions["refused_by_proxy"] ?? 0) > 0, "the baseline has no policy of its own; only the fixture proxy contained it");
    assert.deepEqual(m.B.verifiedDefects, ["malicious-info-icon-unnamed"], "injected instructions did not stop B from assessing the in-scope page");
  });
  it("usage is reported and cost stays unavailable", () => {
    for (const c of trial.comparisons) {
      assert.equal(c.B.usage.cost, "unavailable");
      assert.equal(c.A.usage.modelCalls, 0);
      assert.ok(c.B.usage.modelCalls > 0 && c.B.usage.inputTokens > 0);
    }
  });
  it("writes machine-readable JSON and readable markdown", async () => {
    const json = JSON.parse(await readFile(join(trial.dir, "comparison.json"), "utf8"));
    assert.equal(json.comparisons.length, 6);
    const md = await readFile(join(trial.dir, "comparison.md"), "utf8");
    assert.match(md, /\| news-service \|/);
    assert.match(md, /Cost: unavailable/);
  });
});

describe("observer emits hypotheses only", () => {
  it("every output is a strict hypothesis; there is no way to carry an accepted finding or a patch", async () => {
    for (const c of trial.comparisons) {
      const report = JSON.parse(await readFile(join(trial.dir, c.fixture, "observer.json"), "utf8"));
      assert.equal(report.modelCalls, 0);
      for (const hypothesis of report.hypotheses) { assert.equal(hypothesis.status, "hypothesis"); HypothesisSchema.parse(hypothesis); }
    }
    const sample = JSON.parse(await readFile(join(trial.dir, "news-service", "observer.json"), "utf8")).hypotheses[0];
    for (const extra of [{ patch: "diff --git" }, { accepted: true }, { acceptedFinding: {} }]) assert.throws(() => HypothesisSchema.parse({ ...sample, ...extra }));
    assert.throws(() => HypothesisSchema.parse({ ...sample, status: "accepted" }));
  });
  it("flags the suspicious classification, the missing coverage and the detector error on the development fixtures", async () => {
    const kinds = async (name: FixtureName) => (JSON.parse(await readFile(join(trial.dir, name, "observer.json"), "utf8")).hypotheses as Array<{ kind: string }>).map((h) => h.kind);
    const news = await kinds("news-service");
    for (const kind of ["suspicious_classification", "missing_coverage", "detector_error", "candidate_regression_check"]) assert.ok(news.includes(kind), kind);
    assert.ok((await kinds("menu-dialog")).includes("detector_error"));
  });
});

describe("one observer candidate, end to end (validated, not promoted)", () => {
  it("reproduces on the fixture, passes its regression cases, and is not promoted", () => {
    const candidate = trial.candidate!;
    assert.equal(candidate.check, "aria-controls-target-role");
    assert.equal(candidate.reproduction.reproduced, true);
    assert.equal(candidate.reproduction.wrongTrigger, "menu-btn");
    assert.deepEqual(candidate.reproduction.selectedByCheck, ["help-btn"]);
    assert.equal(candidate.regression.passed, true);
    assert.equal(candidate.status, "validated_not_promoted");
    assert.equal(candidate.promoted, false);
    assert.match(candidate.promotionRequires, /human review/);
  });
  it("held-out variation: reported as observed", async () => {
    const held = trial.candidate!.heldOut!;
    assert.equal(held.fixture, "heldout-menus");
    assert.equal(held.passed, true, "the classification rule handled every held-out trigger");
    // The observer's detector-error rule did NOT fire on the held-out layout: the baseline's first trigger there is a working dialog,
    // so the trap is invisible to it. Only the coverage rule fired. The rule set does not generalise to this layout.
    assert.equal(held.observerDetectorErrorFired, false);
    assert.equal(held.observerMissingCoverageFired, true);
    const c = by("heldout-menus");
    assert.equal(c.heldOut, true);
    assert.deepEqual(c.B.verifiedDefects, ["heldout-share-focus-not-returned"]);
    assert.deepEqual(c.A.verifiedDefects, []);
    assert.deepEqual(c.A.missedDefects, ["heldout-share-focus-not-returned"]);
  });
  it("the candidate is written beside the comparison and nothing was promoted into production code", async () => {
    const written = JSON.parse(await readFile(join(trial.dir, "candidate-validation.json"), "utf8"));
    assert.equal(written.promoted, false);
  });
});
