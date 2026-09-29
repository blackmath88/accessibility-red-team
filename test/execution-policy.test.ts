import assert from "node:assert/strict";
import test from "node:test";
import { backoffDecision } from "../src/control-center/execution-policy.js";

const policy = { perHostConcurrency: 1, delayMs: 5000, maxRetries: 3, baseBackoffMs: 2000, maxBackoffMs: 60_000 };

test("host-safe policy honors Retry-After for 429 responses", () => {
  assert.deepEqual(backoffDecision(429, "12", 0, policy, new Date("2026-09-29T00:00:00Z").getTime()), {
    retry: true, delayMs: 12_000, reason: "retry_after", status: 429, attempt: 0,
  });
});

test("host-safe policy uses bounded exponential backoff for 503", () => {
  assert.equal(backoffDecision(503, null, 2, policy).delayMs, 8000);
  assert.equal(backoffDecision(503, null, 3, policy).reason, "retry_budget_exhausted");
});

test("host-safe policy does not retry unrelated failures", () => {
  assert.equal(backoffDecision(500, null, 0, policy).retry, false);
});
