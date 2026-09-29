import { RunSchema, type Run } from "./contracts.js";
import type { ControlCenterStore } from "./store.js";

export type RequestRunInput = {
  caseId: string;
  propertyId: string;
  kind: Run["kind"];
  requestedBy: string;
  engineRevision: string;
  idempotencyKey: string;
  executionProvider?: Run["executionProvider"];
  executionPolicy?: Run["executionPolicy"];
  now?: Date;
};

export async function requestRun(store: ControlCenterStore, input: RequestRunInput): Promise<{ run: Run; created: boolean }> {
  const existing = await store.findRunByIdempotencyKey(input.idempotencyKey);
  if (existing) {
    if (existing.caseId !== input.caseId || existing.propertyId !== input.propertyId || existing.kind !== input.kind ||
        existing.engineRevision !== input.engineRevision ||
        (input.executionProvider !== undefined && existing.executionProvider !== input.executionProvider) ||
        (input.executionPolicy !== undefined && JSON.stringify(existing.executionPolicy) !== JSON.stringify(input.executionPolicy))) {
      throw new Error("Idempotency key collision with different run intent");
    }
    return { run: existing, created: false };
  }

  const now = (input.now ?? new Date()).toISOString();
  const run = RunSchema.parse({
    schema: "art/control-center-run/v1",
    id: `run_${crypto.randomUUID()}`,
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
    executionProvider: input.executionProvider,
    executionPolicy: input.executionPolicy,
    error: null,
  });
  await store.createRun(run);
  return { run, created: true };
}
