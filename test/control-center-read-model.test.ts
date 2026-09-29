import assert from "node:assert/strict";
import test from "node:test";
import { CaseQueueItemSchema } from "../src/control-center/read-model.js";

test("case queue read model exposes operator next action without inventing conformance", () => {
  const item = CaseQueueItemSchema.parse({
    caseId: "case_1", organizationId: "org_1", organizationName: "Riehen", organizationType: "municipality",
    canton: "BS", propertyId: "prop_1", propertyUrl: "https://example.com/", caseState: "REVIEW",
    latestRun: null, artifactCounts: { field_summary: 1 }, needsHumanReview: true, nextAction: "review",
  });
  assert.equal(item.nextAction, "review");
  assert.equal(item.needsHumanReview, true);
});
