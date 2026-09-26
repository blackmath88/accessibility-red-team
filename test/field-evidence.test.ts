import assert from "node:assert/strict";
import test from "node:test";
import { ProbeResultSchema } from "../src/contracts.js";
import { summarizeFieldEvidenceQuality } from "../src/field-evidence.js";

function probe(input: {
  id: string;
  outcome: "violation" | "incomplete";
  nodes: number;
  criterion?: string;
}) {
  return ProbeResultSchema.parse({
    schema: "art/probe-result/v1",
    probeId: input.id,
    probeVersion: "axe-core/4.13",
    surfaceId: "root",
    stateId: "initial",
    outcome: input.outcome,
    impact: "serious",
    help: input.id,
    helpUrl: "https://example.com/help",
    tags: [],
    requirements: input.criterion ? [{ framework: "WCAG", criterion: input.criterion, sourceTag: "fixture" }] : [],
    nodes: Array.from({ length: input.nodes }, (_, i) => ({ target: [`#n${i}`], html: "<div>", failureSummary: null })),
  });
}

test("field evidence separates rule counts, affected nodes, incomplete and unmapped evidence", () => {
  const summary = summarizeFieldEvidenceQuality([
    probe({ id: "axe.region", outcome: "violation", nodes: 30 }),
    probe({ id: "axe.color-contrast", outcome: "violation", nodes: 1, criterion: "1.4.3" }),
    probe({ id: "axe.color-contrast", outcome: "incomplete", nodes: 13, criterion: "1.4.3" }),
  ]);

  assert.deepEqual(summary.ruleResults, { violations: 2, incomplete: 1 });
  assert.deepEqual(summary.affectedNodes, { violations: 31, incomplete: 13 });
  assert.equal(summary.wcagMappedRuleResults, 2);
  assert.deepEqual(summary.unmappedRuleResults, ["axe.region"]);
  assert.deepEqual(summary.incompleteRuleIds, ["axe.color-contrast"]);
});
