import type { Run } from "./contracts.js";
import type { ExecutionPolicy, WorkerLease } from "./leases.js";

export interface RunQueue {
  claimNext(input: {
    workerId: string;
    now: Date;
    policy: ExecutionPolicy;
  }): Promise<{ run: Run; lease: WorkerLease } | null>;
  renewLease(input: { runId: string; workerId: string; now: Date; policy: ExecutionPolicy }): Promise<WorkerLease>;
  releaseLease(input: { runId: string; workerId: string }): Promise<void>;
}

export class MemoryRunQueue implements RunQueue {
  constructor(private readonly runs: Run[], private readonly propertyUrls: Record<string, string>) {}
  private leases = new Map<string, WorkerLease>();

  async claimNext({ workerId, now, policy }: { workerId: string; now: Date; policy: ExecutionPolicy }) {
    const nowMs = now.getTime();
    for (const [runId, lease] of this.leases) if (Date.parse(lease.expiresAt) <= nowMs) this.leases.delete(runId);

    const activeHosts = new Map<string, number>();
    for (const lease of this.leases.values()) activeHosts.set(lease.hostKey, (activeHosts.get(lease.hostKey) ?? 0) + 1);

    for (const run of this.runs) {
      if (run.state !== "queued" || this.leases.has(run.id)) continue;
      const url = this.propertyUrls[run.propertyId];
      if (!url) continue;
      const hostKey = new URL(url).hostname.toLowerCase();
      if ((activeHosts.get(hostKey) ?? 0) >= policy.maxConcurrentPerHost) continue;
      const lease: WorkerLease = {
        schema: "art/control-center-worker-lease/v1", runId: run.id, workerId, hostKey,
        acquiredAt: now.toISOString(), expiresAt: new Date(nowMs + policy.leaseSeconds * 1000).toISOString(), attempt: 1,
      };
      this.leases.set(run.id, lease);
      return { run, lease };
    }
    return null;
  }

  async renewLease({ runId, workerId, now, policy }: { runId: string; workerId: string; now: Date; policy: ExecutionPolicy }) {
    const lease = this.leases.get(runId);
    if (!lease || lease.workerId !== workerId) throw new Error("Lease not owned by worker");
    const renewed = { ...lease, expiresAt: new Date(now.getTime() + policy.leaseSeconds * 1000).toISOString() };
    this.leases.set(runId, renewed);
    return renewed;
  }

  async releaseLease({ runId, workerId }: { runId: string; workerId: string }) {
    const lease = this.leases.get(runId);
    if (!lease) return;
    if (lease.workerId !== workerId) throw new Error("Lease not owned by worker");
    this.leases.delete(runId);
  }
}
