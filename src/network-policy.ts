import type { Page, Response } from "playwright";
import { backoffDecision } from "./control-center/execution-policy.js";
import type { ExecutionPolicy } from "./control-center/contracts.js";

export type NetworkPolicyEvent = { url: string; status: number; attempt: number; decision: string; delayMs: number; at: string };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function gotoWithPolicy(
  page: Page,
  url: string,
  options: { waitUntil: "domcontentloaded"; timeout: number },
  policy?: ExecutionPolicy,
  events: NetworkPolicyEvent[] = [],
): Promise<Response | null> {
  if (!policy) return page.goto(url, options);
  for (let attempt = 0; ; attempt += 1) {
    await wait(policy.delayMs);
    const response = await page.goto(url, options);
    if (!response) return response;
    const decision = backoffDecision(response.status(), response.headers()["retry-after"] ?? null, attempt, policy);
    if (response.status() === 429 || response.status() === 503) {
      events.push({ url, status: response.status(), attempt, decision: decision.reason, delayMs: decision.delayMs, at: new Date().toISOString() });
    }
    if (!decision.retry) return response;
    await wait(decision.delayMs);
  }
}
