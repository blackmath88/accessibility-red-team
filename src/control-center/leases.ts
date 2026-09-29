import { z } from "zod";

export const WorkerLeaseSchema = z.object({
  schema: z.literal("art/control-center-worker-lease/v1"),
  runId: z.string().min(1),
  workerId: z.string().min(1),
  hostKey: z.string().min(1),
  acquiredAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  attempt: z.number().int().positive(),
});
export type WorkerLease = z.infer<typeof WorkerLeaseSchema>;

export const ExecutionPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  leaseSeconds: z.number().int().min(30).max(3600).default(300),
  maxConcurrentPerHost: z.number().int().min(1).max(10).default(1),
  retryBaseSeconds: z.number().int().min(1).max(3600).default(30),
});
export type ExecutionPolicy = z.infer<typeof ExecutionPolicySchema>;

export function canonicalHostKey(url: string): string {
  const parsed = new URL(url);
  return parsed.hostname.toLowerCase().replace(/\.$/, "");
}

export function retryDelaySeconds(attempt: number, policy: ExecutionPolicy): number {
  if (attempt < 1) throw new Error("attempt must be >= 1");
  return Math.min(policy.retryBaseSeconds * 2 ** (attempt - 1), 3600);
}
