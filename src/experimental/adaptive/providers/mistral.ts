// Experimental adaptive-assessment track (docs/experiments/ADAPTIVE_MISTRAL.md). Not imported by production code.
// Direct fetch adapter for Mistral's chat completions endpoint. No SDK, no retries, no fallback provider.
// Nothing here is authorised to run against the real API until the owner approves credential source, model and spend cap.
import { z } from "zod";
import { ProviderError } from "../provider.js";
import type { ModelProvider, ModelRequest, ModelResponse, ProviderCapabilities } from "../provider.js";

export type MistralConfig = {
  // Name of the environment variable that holds the API key. The key itself is never accepted as config.
  apiKeyEnv: string;
  // Pinned model id, sent verbatim. Mistral may answer with a different (e.g. dated) id; that is recorded, not hidden.
  model: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
};

export const MISTRAL_DEFAULT_BASE_URL = "https://api.mistral.ai";

const ChatBody = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string() }).passthrough() }).passthrough()).min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).passthrough().optional(),
}).passthrough();

export type MistralPreflight = {
  jsonObjectHonoured: boolean;
  returnedModel?: string;
  latencyMs: number;
  // Everything not observed here (json schema, tools, vision) stays unverified.
  note: string;
};

// True when the provider reported exactly the model that was requested. Aliases such as "*-latest" will differ.
export const modelIdentityMatches = (response: Pick<ModelResponse, "requestedModel" | "returnedModel">) =>
  response.returnedModel !== undefined && response.returnedModel === response.requestedModel;

export class MistralProvider implements ModelProvider {
  readonly id = "mistral";
  readonly requestedModel: string;
  // Declared from Mistral's public API shape, not observed. Vision is model-dependent, so it is not claimed.
  readonly capabilities: ProviderCapabilities = { jsonObject: true, jsonSchema: true, toolCalling: true, vision: false, verified: false };
  private readonly endpoint: string;
  private readonly apiKeyEnv: string;
  // #private so JSON.stringify / util.inspect of the provider can never reach the environment holding the key.
  readonly #doFetch: typeof fetch;
  readonly #env: Record<string, string | undefined>;

  constructor(config: MistralConfig) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(config.apiKeyEnv)) throw new ProviderError("config", "apiKeyEnv must be the NAME of an environment variable (upper-case letters, digits, underscore)");
    if (!config.model) throw new ProviderError("config", "model must be pinned explicitly");
    let base: URL;
    try { base = new URL(config.baseUrl ?? MISTRAL_DEFAULT_BASE_URL); } catch { throw new ProviderError("config", "baseUrl is not a valid URL"); }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
    if (base.protocol !== "https:" && !(base.protocol === "http:" && loopback)) throw new ProviderError("config", "baseUrl must be https (http only for loopback)");
    this.endpoint = `${base.origin}${base.pathname.replace(/\/+$/, "")}/v1/chat/completions`;
    this.apiKeyEnv = config.apiKeyEnv;
    this.requestedModel = config.model;
    this.#doFetch = config.fetch ?? fetch;
    this.#env = config.env ?? process.env;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const key = this.#env[this.apiKeyEnv];
    if (!key) throw new ProviderError("config", `environment variable ${this.apiKeyEnv} is not set`);
    if (request.signal?.aborted) throw new ProviderError("cancelled", "request cancelled before it was sent");

    const body = {
      model: this.requestedModel,
      messages: request.messages,
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature,
      stream: false,
      ...(request.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
    };
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, request.timeoutMs);
    const onAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onAbort, { once: true });
    const started = performance.now();
    try {
      let res: Response;
      let text: string;
      try {
        res = await this.#doFetch(this.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify(body),
          signal: controller.signal,
          // A redirect could carry the Authorization header somewhere else; it is an error instead.
          redirect: "error",
        });
        text = await res.text();
      } catch {
        // Transport errors are reduced to a kind; their messages are never forwarded (they can echo request details).
        if (timedOut) throw new ProviderError("timeout", `no response within ${request.timeoutMs} ms`);
        if (request.signal?.aborted) throw new ProviderError("cancelled", "request cancelled");
        throw new ProviderError("http", "network error before a response was received");
      }
      if (!res.ok) throw new ProviderError("http", `Mistral returned HTTP ${res.status}`, res.status);
      let parsed: z.infer<typeof ChatBody>;
      try { parsed = ChatBody.parse(JSON.parse(text)); } catch { throw new ProviderError("malformed_response", "response body is not a valid chat completion"); }
      return {
        text: parsed.choices[0]!.message.content,
        requestedModel: this.requestedModel,
        ...(parsed.model !== undefined ? { returnedModel: parsed.model } : {}),
        ...(parsed.usage ? { usage: { inputTokens: parsed.usage.prompt_tokens, outputTokens: parsed.usage.completion_tokens } } : {}),
        latencyMs: Math.round(performance.now() - started),
        parameters: { temperature: request.temperature, maxOutputTokens: request.maxOutputTokens, responseFormat: request.responseFormat },
      };
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
    }
  }

  // One tiny real call that observes json_object handling and the returned model id. NEVER called by tests or CI:
  // it spends money and sends data to the provider, so it needs the same owner approval as any live call.
  async preflight(options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<MistralPreflight> {
    const response = await this.complete({
      messages: [{ role: "user", content: 'Reply with the JSON object {"ok": true} and nothing else.' }],
      maxOutputTokens: 16, temperature: 0, responseFormat: "json_object", timeoutMs: options.timeoutMs ?? 15_000,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    let honoured = false;
    try { const value: unknown = JSON.parse(response.text); honoured = typeof value === "object" && value !== null && !Array.isArray(value); } catch { /* not JSON */ }
    return {
      jsonObjectHonoured: honoured,
      ...(response.returnedModel !== undefined ? { returnedModel: response.returnedModel } : {}),
      latencyMs: response.latencyMs,
      note: "capabilities.verified stays false; json schema, tool calling and vision were not observed",
    };
  }
}
