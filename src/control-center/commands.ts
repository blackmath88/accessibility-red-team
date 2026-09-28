import { randomUUID } from "node:crypto";
import { RunSchema, type Run } from "./contracts.js";
import type { ControlCenterStore } from "./store.js";

export type RequestRunInput = {
  caseId: string;
  propertyId: string;
  kind: Run["kind"];
  requestedBy: string;
  engineRevision: string;
  idempotencyKey: string;
  now?: Date;
};

export async function requestRun(store: ControlCenterStore, input: RequestRunInput): Promise<{ run: Run; created: boolean }> {
  const existing = await store.findRunByIdempotencyKey(input.idempotencyKey);
  if (existing) {
    if (existing.caseId !== input.caseId || existing.propertyId !== input.propertyId || existing.kind !== input.kind) {
      throw new Error("Idempotency key collision with different run intent");
    }
    return { run: existing, created: false };
  }

  const now = (input.now ?? new Date()).toISOString();
  const run = RunSchema.parse({
    schema: "art/control-center-run/v1",
    id: `run_${randomUUID()}`,
    caseId: input.caseId,
    propertyId: input.propertyId,
    kind: input.kind,
    state: "queued",
    idempotencyKey: input.idempotencyKey,
    requestedBy: input.requestedBy,
    requestedAt: now,
    startedAt: null,
    completedAt: null,
    engineRevision: input.engineRevision,
    error: null,
  });
  await store.createRun(run);
  return { run, created: true };
}
