import test from "node:test";
import assert from "node:assert/strict";
import { selectRepresentativeSurfaces } from "../src/scout/sample.js";
import type { DiscoveredPage } from "../src/scout/contracts.js";

function page(url: string, kind: DiscoveredPage["kind"], fp: string, depth = 1): DiscoveredPage {
  return {
    url,
    title: url,
    kind,
    reason: "test",
    depth,
    structuralFingerprint: fp,
    hasForm: kind === "form",
    pdfLinks: 0,
    internalLinks: 10,
  };
}

test("deduplicates same-kind template fingerprints", () => {
  const result = selectRepresentativeSurfaces([
    page("https://example.ch/a", "service", "same"),
    page("https://example.ch/b", "service", "same"),
    page("https://example.ch/c", "service", "different"),
  ]);
  assert.deepEqual(result.map((x) => x.url), ["https://example.ch/a", "https://example.ch/c"]);
});
