import test from "node:test";
import assert from "node:assert/strict";
import { requirementsFromAxeTags } from "../src/wcag.js";

test("extracts WCAG success criteria from axe tags", () => {
  assert.deepEqual(requirementsFromAxeTags(["wcag2a", "wcag111", "wcag412"]), [
    { framework: "WCAG", criterion: "1.1.1", sourceTag: "wcag111" },
    { framework: "WCAG", criterion: "4.1.2", sourceTag: "wcag412" },
  ]);
});

test("ignores non-criterion tags", () => {
  assert.deepEqual(requirementsFromAxeTags(["cat.forms", "best-practice", "wcag2aa"]), []);
});
