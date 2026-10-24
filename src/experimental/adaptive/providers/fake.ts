// Deterministic scripted provider for tests and CI. It never touches the network.
import { createHash } from "node:crypto";
import type { ModelProvider, ModelRequest, ModelResponse, ProviderCapabilities } from "../provider.js";
import { ProviderError } from "../provider.js";
import type { Observation } from "../contracts.js";

export const OBSERVATION_MARKER = "OBSERVATION_JSON";

export type FakeReply =
  | { action: unknown; rationale?: string }
  | { raw: string }
  | { hang: true }
  | { error: ProviderError };

export type FakeContext = { observation: Observation | null; call: number; request: ModelRequest };
export type FakeScript = (context: FakeContext) => FakeReply | Promise<FakeReply>;

export function parseObservation(request: ModelRequest): Observation | null {
  const user = [...request.messages].reverse().find((message) => message.role === "user");
  if (!user) return null;
  const start = user.content.indexOf("\n");
  try { return JSON.parse(user.content.slice(start + 1)) as Observation; } catch { return null; }
}

// A fixed sequence of actions; useful for failure-mode tests. After the sequence ends it finishes.
export function fixedScript(actions: unknown[]): FakeScript {
  return ({ call }) => ({ action: actions[call] ?? { type: "finish", verdict: "inconclusive", summary: "script exhausted" } });
}

export class FakeProvider implements ModelProvider {
  readonly id = "fake";
  readonly requestedModel: string;
  readonly capabilities: ProviderCapabilities = { jsonObject: true, jsonSchema: false, toolCalling: false, vision: false, verified: false };
  readonly requests: ModelRequest[] = [];
  calls = 0;

  constructor(private readonly script: FakeScript, options: { model?: string } = {}) {
    this.requestedModel = options.model ?? "fake-scripted-v1";
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const startedAt = Date.now();
    const call = this.calls++;
    this.requests.push(request);
    if (request.signal?.aborted) throw new ProviderError("cancelled", "request aborted before start");
    const reply = await this.script({ observation: parseObservation(request), call, request });
    if ("error" in reply) throw reply.error;
    if ("hang" in reply) {
      await new Promise<never>((_resolve, reject) => {
        const onAbort = () => reject(new ProviderError("cancelled", "aborted while waiting for the model"));
        if (request.signal?.aborted) onAbort();
        request.signal?.addEventListener("abort", onAbort, { once: true });
        setTimeout(() => reject(new ProviderError("timeout", `no answer within ${request.timeoutMs}ms`)), request.timeoutMs).unref();
      });
    }
    if ("hang" in reply) throw new ProviderError("timeout", "unreachable");
    const text = "raw" in reply ? reply.raw : JSON.stringify({ action: reply.action, ...(reply.rationale ? { rationale: reply.rationale } : {}) });
    const input = request.messages.map((message) => message.content).join("");
    return {
      text,
      requestedModel: this.requestedModel,
      returnedModel: this.requestedModel,
      usage: { inputTokens: Math.ceil(input.length / 4), outputTokens: Math.ceil(text.length / 4) },
      latencyMs: Date.now() - startedAt,
      parameters: { temperature: request.temperature, maxOutputTokens: request.maxOutputTokens, responseFormat: request.responseFormat },
    };
  }
}

export const sha256Hex = (text: string) => createHash("sha256").update(text).digest("hex");
