import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { classifyTrigger } from "../src/experimental/adaptive/candidate-checks.js";

type Frozen = { cases: Array<{ fixture: string; heldOut: boolean; id: string; controls: string | null; controlsRole: string | null; haspopup: string | null; expected: string }> };
const frozen = JSON.parse(readFileSync(new URL("./fixtures/adaptive-sites/frozen/aria-controls-triggers.json", import.meta.url), "utf8")) as Frozen;

// Regression check for the observer candidate "aria-controls-target-role". Not promoted: it exists to pin the candidate's behaviour
// on frozen fixture evidence so that a future, human-reviewed scanner change can be validated against it.
describe("candidate check aria-controls-target-role (frozen fixture evidence)", () => {
  it("has frozen cases for the development and the held-out fixture", () => {
    assert.ok(frozen.cases.some((entry) => !entry.heldOut));
    assert.ok(frozen.cases.some((entry) => entry.heldOut));
  });
  for (const entry of frozen.cases) {
    it(`${entry.fixture}#${entry.id} is ${entry.expected}`, () => {
      assert.equal(classifyTrigger(entry), entry.expected);
    });
  }
  it("rule edge cases", () => {
    assert.equal(classifyTrigger({ controls: null, controlsRole: null, haspopup: null }), "not_applicable");
    assert.equal(classifyTrigger({ controls: null, controlsRole: null, haspopup: "dialog" }), "dialog_trigger");
    assert.equal(classifyTrigger({ controls: "x", controlsRole: "alertdialog", haspopup: null }), "dialog_trigger");
    assert.equal(classifyTrigger({ controls: "x", controlsRole: "ul", haspopup: "true" }), "disclosure_menu");
    assert.equal(classifyTrigger({ controls: "x", controlsRole: null, haspopup: null }), "unknown_target");
  });
});
