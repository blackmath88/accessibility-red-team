// Experimental adaptive-assessment track (docs/experiments/ADAPTIVE_MISTRAL.md). Not imported by production code.
// Trial-wide hard budget around a real provider. The executor already enforces per-session budgets; this wrapper enforces the totals
// across every session of a trial (all fixtures), including spend. A call is refused BEFORE it is sent if its worst case (estimated input
// with a safety factor, plus the full requested output) could break any cap. It never retries and never raises a cap.
import { ProviderError } from "./provider.js";
import type { ModelProvider, ModelRequest, ModelResponse } from "./provider.js";

export type Pricing = { currency: string; inputPerMillion: number; outputPerMillion: number };

export type TrialBudget = {
  maxCalls: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxSpend: number; // in pricing.currency
  maxWallMs: number;
  minCallIntervalMs: number;
};

export type BudgetLedger = {
  calls: number;
  refused: number;
  inputTokens: number;
  outputTokens: number;
  // Tokens taken from the estimate because the provider reported no usage for a call.
  estimatedCalls: number;
  spend: number;
  startedAtMs: number;
  stopReason: string | null;
};

// Characters per token is 4 in the executor's own estimate; real tokenisers can produce more tokens for markup and non-English text.
export const INPUT_ESTIMATE_SAFETY = 1.5;
const estimateTokens = (request: ModelRequest) => Math.ceil(request.messages.reduce((sum, message) => sum + message.content.length, 0) / 4);

export const costOf = (pricing: Pricing, inputTokens: number, outputTokens: number) =>
  (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;

// The most a trial can cost if every cap is used to the full.
export const worstCaseSpend = (pricing: Pricing, budget: TrialBudget) => costOf(pricing, budget.maxInputTokens, budget.maxOutputTokens);

export class BudgetedProvider implements ModelProvider {
  readonly id: string;
  readonly requestedModel: string;
  readonly capabilities: ModelProvider["capabilities"];
  readonly ledger: BudgetLedger;
  private lastCallAtMs = Number.NEGATIVE_INFINITY;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly inner: ModelProvider, private readonly pricing: Pricing, private readonly budget: TrialBudget, private readonly now: () => number = Date.now, private readonly sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))) {
    this.id = inner.id;
    this.requestedModel = inner.requestedModel;
    this.capabilities = inner.capabilities;
    this.ledger = { calls: 0, refused: 0, inputTokens: 0, outputTokens: 0, estimatedCalls: 0, spend: 0, startedAtMs: now(), stopReason: null };
  }

  // Calls are serialised so that the ledger check and the call are atomic with respect to each other.
  complete(request: ModelRequest): Promise<ModelResponse> {
    const run = this.chain.then(() => this.one(request));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private refuse(reason: string): never {
    this.ledger.refused += 1;
    this.ledger.stopReason ??= reason;
    throw new ProviderError("budget", reason);
  }

  private async one(request: ModelRequest): Promise<ModelResponse> {
    const { ledger, budget, pricing } = this;
    if (ledger.stopReason) this.refuse(ledger.stopReason);
    const inputWorst = Math.ceil(estimateTokens(request) * INPUT_ESTIMATE_SAFETY);
    const outputWorst = request.maxOutputTokens;
    if (ledger.calls + 1 > budget.maxCalls) this.refuse(`trial maxCalls ${budget.maxCalls} reached`);
    if (ledger.inputTokens + inputWorst > budget.maxInputTokens) this.refuse(`trial maxInputTokens ${budget.maxInputTokens} would be exceeded`);
    if (ledger.outputTokens + outputWorst > budget.maxOutputTokens) this.refuse(`trial maxOutputTokens ${budget.maxOutputTokens} would be exceeded`);
    if (ledger.spend + costOf(pricing, inputWorst, outputWorst) > budget.maxSpend) this.refuse(`trial spend cap ${budget.maxSpend} ${pricing.currency} would be exceeded`);
    const elapsed = this.now() - ledger.startedAtMs;
    if (elapsed >= budget.maxWallMs) this.refuse(`trial maxWallMs ${budget.maxWallMs} elapsed`);

    const wait = this.lastCallAtMs + budget.minCallIntervalMs - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastCallAtMs = this.now();
    ledger.calls += 1;
    // Count the worst case up front so that a failed or timed-out call still counts against the caps (it may have been billed).
    ledger.inputTokens += inputWorst;
    ledger.outputTokens += outputWorst;
    ledger.spend += costOf(pricing, inputWorst, outputWorst);
    const timeoutMs = Math.max(100, Math.min(request.timeoutMs, budget.maxWallMs - (this.now() - ledger.startedAtMs)));
    const response = await this.inner.complete({ ...request, timeoutMs });
    // Replace the reservation with what the provider reported. Without reported usage the reservation stands.
    if (response.usage) {
      ledger.inputTokens += response.usage.inputTokens - inputWorst;
      ledger.outputTokens += response.usage.outputTokens - outputWorst;
      ledger.spend += costOf(pricing, response.usage.inputTokens, response.usage.outputTokens) - costOf(pricing, inputWorst, outputWorst);
    } else {
      ledger.estimatedCalls += 1;
    }
    return response;
  }
}
