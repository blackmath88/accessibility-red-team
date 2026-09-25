import test from "node:test";
import assert from "node:assert/strict";
import { classifyBySignals } from "../src/scout/classify.js";

const base = {
  url: "https://example.ch/foo",
  title: "",
  h1: "",
  hasForm: false,
  searchInputs: 0,
  linkCount: 4,
  pathDepth: 1,
};

test("classifies forms deterministically", () => {
  assert.equal(classifyBySignals({ ...base, hasForm: true }).kind, "form");
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
