import assert from "node:assert/strict";
import test from "node:test";
import { requestRun } from "../src/control-center/commands.js";
import { MemoryControlCenterStore } from "../src/control-center/store.js";

test("requestRun is idempotent for identical intent", async () => {
  const store = new MemoryControlCenterStore();
  const input = { caseId: "case_1", propertyId: "prop_1", kind: "assessment" as const, requestedBy: "operator:a", engineRevision: "git:abc", idempotencyKey: "same", now: new Date("2026-09-28T20:00:00Z") };
  const first = await requestRun(store, input);
  const second = await requestRun(store, input);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.run.id, second.run.id);
});

test("idempotency collision fails closed when intent differs", async () => {
  const store = new MemoryControlCenterStore();
  await requestRun(store, { caseId: "case_1", propertyId: "prop_1", kind: "scan", requestedBy: "operator:a", engineRevision: "git:abc", idempotencyKey: "collision" });
  await assert.rejects(() => requestRun(store, { caseId: "case_1", propertyId: "prop_1", kind: "journeys", requestedBy: "operator:a", engineRevision: "git:abc", idempotencyKey: "collision" }));
});
