import type { ExecutionPolicy } from "./contracts.js";

export type BackoffDecision = {
  retry: boolean;
  delayMs: number;
  reason: "retry_after" | "exponential_backoff" | "retry_budget_exhausted" | "not_retryable";
  status: number;
  attempt: number;
};

function retryAfterMs(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - nowMs) : null;
}

export function backoffDecision(
  status: number,
  retryAfter: string | null,
  attempt: number,
  policy: ExecutionPolicy,
  nowMs = Date.now(),
): BackoffDecision {
  if (status !== 429 && status !== 503) {
    return { retry: false, delayMs: 0, reason: "not_retryable", status, attempt };
  }
  if (attempt >= policy.maxRetries) {
    return { retry: false, delayMs: 0, reason: "retry_budget_exhausted", status, attempt };
  }
  const requested = retryAfterMs(retryAfter, nowMs);
  if (requested !== null) {
    return {
      retry: true,
      delayMs: Math.min(policy.maxBackoffMs, Math.max(policy.delayMs, requested)),
      reason: "retry_after",
      status,
      attempt,
    };
  }
  return {
    retry: true,
    delayMs: Math.min(policy.maxBackoffMs, Math.max(policy.delayMs, policy.baseBackoffMs * 2 ** attempt)),
    reason: "exponential_backoff",
    status,
    attempt,
  };
}
