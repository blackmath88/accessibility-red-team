import test from "node:test";
import assert from "node:assert/strict";
import { resolveRequirement } from "../src/provenance/resolve.js";
import type { JurisdictionProfile, SourceRegistry } from "../src/provenance/contracts.js";

const profile: JurisdictionProfile = {
  schema: "test",
  id: "ch.federal.public-web",
  jurisdiction: "CH",
  target_type: "federal_administration",
  as_of: "2026-09-25",
  baseline: {
    ech: { id: "eCH-0059", version: "3.0", strength: "MANDATORY", source_ref: "federal" },
    wcag: { version: "2.1", level: "AA", strength: "MANDATORY", incorporation_source_ref: "ech" },
  },
  best_practice: { wcag: { version: "2.2", level: "AA", strength: "BEST_PRACTICE" } },
};

const registry: SourceRegistry = {
  schema: "test",
  as_of: "2026-09-25",
  sources: [
    { id: "federal", title: "Federal", issuer: "Federal", jurisdiction: "CH", authority_class: "OFFICIAL_GUIDANCE", url: "https://example.com/f", assertions: [] },
    { id: "ech", title: "eCH", issuer: "eCH", jurisdiction: "CH", authority_class: "TECHNICAL_STANDARD", url: "https://example.com/e", assertions: [] },
  ],
};

test("maps AA WCAG 2.x findings into the federal baseline", () => {
  const result = resolveRequirement("1.4.3", ["wcag2aa", "wcag143"], profile, registry);
  assert.equal(result.status, "APPLICABLE");
  assert.equal(result.strength, "MANDATORY");
});

test("does not turn WCAG 2.2-only tags into federal WCAG 2.1 mandatory requirements", () => {
  const result = resolveRequirement("2.4.11", ["wcag22aa", "wcag2411"], profile, registry);
  assert.equal(result.status, "BEST_PRACTICE");
});
