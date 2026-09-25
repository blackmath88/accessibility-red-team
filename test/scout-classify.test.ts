import test from "node:test";
import assert from "node:assert/strict";
import { classifyBySignals } from "../src/scout/classify.js";

const base = {
  url: "https://example.ch/foo",
  title: "",
  h1: "",
  formCount: 0,
  substantiveFormFields: 0,
  searchInputs: 0,
  linkCount: 4,
  pathDepth: 1,
};

test("classifies substantive forms deterministically", () => {
  assert.equal(classifyBySignals({ ...base, formCount: 1, substantiveFormFields: 3 }).kind, "form");
});

test("does not classify global search chrome as a form or search page", () => {
  assert.equal(classifyBySignals({ ...base, formCount: 1, searchInputs: 1 }).kind, "unknown");
});

test("classifies a dedicated search URL", () => {
  assert.equal(classifyBySignals({ ...base, url: "https://example.ch/suche" }).kind, "search");
});

test("classifies dense service directories", () => {
  assert.equal(classifyBySignals({
    ...base,
    title: "Dienstleistungen A-Z",
    linkCount: 40,
  }).kind, "directory");
});

test("uses unknown instead of forcing a guess", () => {
  assert.equal(classifyBySignals(base).kind, "unknown");
});
