import type { Run } from "./contracts.js";

const allowed: Record<Run["state"], Run["state"][]> = {
  queued: ["running", "cancelled"],
  running: ["succeeded", "partial", "failed", "cancelled"],
  succeeded: [],
  partial: [],
  failed: [],
  cancelled: [],
};

export function canTransitionRun(from: Run["state"], to: Run["state"]): boolean {
  return allowed[from].includes(to);
}

export function assertRunTransition(from: Run["state"], to: Run["state"]): void {
  if (!canTransitionRun(from, to)) throw new Error(`Invalid run transition: ${from} -> ${to}`);
}
