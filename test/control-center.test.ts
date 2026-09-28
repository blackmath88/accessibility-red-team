import assert from "node:assert/strict";
import test from "node:test";
import { ArtifactSchema, RunSchema } from "../src/control-center/contracts.js";
import { assertRunTransition, canTransitionRun } from "../src/control-center/state.js";

test("run contract requires idempotency and engine revision", () => {
  const run = RunSchema.parse({
    schema: "art/control-center-run/v1", id: "run_1", caseId: "case_1", propertyId: "prop_1",
    kind: "assessment", state: "queued", idempotencyKey: "case_1:assessment:2026-09-28",
    requestedBy: "operator:achim", requestedAt: "2026-09-28T20:00:00.000Z",
    startedAt: null, completedAt: null, engineRevision: "git:abc123", error: null,
  });
  assert.equal(run.state, "queued");
  assert.equal(run.engineRevision, "git:abc123");
});

test("run state machine is terminal after success", () => {
  assert.equal(canTransitionRun("queued", "running"), true);
  assert.equal(canTransitionRun("running", "succeeded"), true);
  assert.equal(canTransitionRun("succeeded", "running"), false);
  assert.throws(() => assertRunTransition("succeeded", "running"));
});

test("artifact requires immutable digest metadata", () => {
  const artifact = ArtifactSchema.parse({
    schema: "art/control-center-artifact/v1", id: "artifact_1", runId: "run_1",
    kind: "report_json", contentType: "application/json", storageKey: "runs/run_1/report.json",
    sha256: "a".repeat(64), bytes: 42, createdAt: "2026-09-28T20:00:00.000Z",
  });
  assert.equal(artifact.sha256.length, 64);
});
