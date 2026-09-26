import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_REQUIREMENT_CAPABILITIES } from "../src/capability.js";
import { summarizeRunCoverage } from "../src/run-coverage.js";

test("run coverage separates capability from evidence actually observed", () => {
  const coverage = summarizeRunCoverage(INITIAL_REQUIREMENT_CAPABILITIES, [{
    criterion: "2.4.3",
    mode: "BEHAVIORAL",
    evidenceRef: "journey:keyboard-focus-trace:surface_root",
  }]);

  const focusOrder = coverage.find((item) => item.criterion === "2.4.3");
  assert.ok(focusOrder);
  assert.equal(focusOrder.status, "HUMAN_REVIEW_REMAINS");
  assert.deepEqual(focusOrder.observedModes, ["BEHAVIORAL"]);
  assert.deepEqual(focusOrder.evidenceRefs, ["journey:keyboard-focus-trace:surface_root"]);

  const errorSuggestion = coverage.find((item) => item.criterion === "3.3.3");
  assert.ok(errorSuggestion);
  assert.equal(errorSuggestion.status, "NOT_OBSERVED");
  assert.deepEqual(errorSuggestion.observedModes, []);
});

test("absence of evidence never becomes a pass", () => {
  const coverage = summarizeRunCoverage(INITIAL_REQUIREMENT_CAPABILITIES, []);
  assert.equal(coverage.every((item) => item.status === "NOT_OBSERVED"), true);
});
