import assert from "node:assert/strict";
import test from "node:test";
import { hasUsableFocusEvidence } from "../src/journeys/focus-evidence.js";

const viewport = { width: 1440, height: 900 };
const visual = {
  focusVisible: true,
  outlineStyle: "auto",
  outlineWidth: "1px",
  boxShadow: "none",
};

test("off-screen zero-area focus target is not usable visible-focus evidence", () => {
  assert.equal(hasUsableFocusEvidence({
    ...visual,
    rect: { x: -16001, y: -16001, width: 0, height: 0 },
  }, viewport), false);
});

test("on-screen focus target with visible outline is usable evidence", () => {
  assert.equal(hasUsableFocusEvidence({
    ...visual,
    rect: { x: 60, y: 40, width: 315, height: 65 },
  }, viewport), true);
});

test("on-screen target without a detectable focus treatment remains unresolved", () => {
  assert.equal(hasUsableFocusEvidence({
    focusVisible: true,
    outlineStyle: "none",
    outlineWidth: "0px",
    boxShadow: "none",
    rect: { x: 60, y: 40, width: 100, height: 30 },
  }, viewport), false);
});
