// Experimental adaptive-assessment track (docs/experiments/ADAPTIVE_ASSESSMENT_BUILD_PLAN.md).
// Nothing under src/experimental/ may be imported by the production scanner, worker, control plane or reports.

// Provider-neutral model interface. Deliberately small: one completion call, no tools, no provider framework.
// Capabilities are declared by the adapter but count as unverified until a preflight has observed them.
export type ModelMessage = { role: "system" | "user" | "assistant"; content: string };

export type ModelRequest = {
  messages: ModelMessage[];
  maxOutputTokens: number;
  temperature: number;
  responseFormat: "text" | "json_object";
  timeoutMs: number;
  signal?: AbortSignal;
};

export type ModelUsage = { inputTokens: number; outputTokens: number };

export type ModelResponse = {
  text: string;
  requestedModel: string;
  // Identity reported by the provider; undefined when the provider did not report one.
  returnedModel?: string;
  usage?: ModelUsage;
  latencyMs: number;
  parameters: { temperature: number; maxOutputTokens: number; responseFormat: ModelRequest["responseFormat"] };
};

export type ProviderCapabilities = {
  jsonObject: boolean;
  jsonSchema: boolean;
  toolCalling: boolean;
  vision: boolean;
  // false until a preflight against the real endpoint has confirmed the declared capabilities.
  verified: boolean;
};

export interface ModelProvider {
  readonly id: string;
  readonly requestedModel: string;
  readonly capabilities: ProviderCapabilities;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export type ProviderErrorKind = "config" | "timeout" | "cancelled" | "http" | "malformed_response" | "budget";

export class ProviderError extends Error {
  constructor(readonly kind: ProviderErrorKind, message: string, readonly status?: number) {
    super(message);
    this.name = "ProviderError";
  }
}
