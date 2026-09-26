import assert from "node:assert/strict";
import test from "node:test";

import {
  CoverageManifestSchema,
  INITIAL_REQUIREMENT_CAPABILITIES,
  buildCoverageManifest,
} from "../src/capability.js";

test("coverage registry spans deterministic, behavioral, semantic and human boundaries", () => {
  const byCriterion = new Map(INITIAL_REQUIREMENT_CAPABILITIES.map((item) => [item.criterion, item]));

  assert.equal(byCriterion.get("2.5.8")?.deterministic, "STRONG");
  assert.equal(byCriterion.get("2.4.3")?.behavioral, "STRONG");
  assert.equal(byCriterion.get("3.3.3")?.semantic, "STRONG");
  assert.equal(byCriterion.get("1.1.1")?.humanReview, true);
});

test("coverage manifest refuses a fake aggregate automation percentage", () => {
  const manifest = buildCoverageManifest();
  CoverageManifestSchema.parse(manifest);

  assert.equal("automationCeiling" in manifest, false);
  assert.ok(manifest.limitations.some((item) => item.includes("not a conformance percentage")));
  assert.equal(manifest.engine.configuration, "default");
  assert.deepEqual(manifest.engine.enabledRules, []);
  assert.deepEqual(manifest.engine.explicitlyDisabledByDefault, ["target-size"]);
});
