import assert from "node:assert/strict";
import test from "node:test";
import { ProviderError } from "../src/experimental/adaptive/provider.js";
import type { ModelRequest } from "../src/experimental/adaptive/provider.js";
import { MistralProvider, modelIdentityMatches } from "../src/experimental/adaptive/providers/mistral.js";

const KEY = "sk-test-SECRET-0123456789";
const ENV = { ADAPTIVE_MISTRAL_API_KEY: KEY };
const request = (over: Partial<ModelRequest> = {}): ModelRequest => ({
  messages: [{ role: "user", content: "hi" }], maxOutputTokens: 64, temperature: 0, responseFormat: "text", timeoutMs: 1000, ...over,
});
const ok = (over: object = {}) => new Response(JSON.stringify({
  model: "mistral-small-2506", choices: [{ message: { role: "assistant", content: "hello" } }], usage: { prompt_tokens: 5, completion_tokens: 2 }, ...over,
}), { status: 200 });
type Call = { url: string; init: RequestInit };
function provider(fetchImpl: (url: string, init: RequestInit) => Promise<Response>, over: object = {}) {
  const calls: Call[] = [];
  const p = new MistralProvider({
    apiKeyEnv: "ADAPTIVE_MISTRAL_API_KEY", model: "mistral-small-2506", env: ENV,
    fetch: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return fetchImpl(url, init); }) as typeof fetch, ...over,
  });
  return { p, calls };
}
const rejects = async (promise: Promise<unknown>, kind: string) => {
  const err = await promise.then(() => null, (e: unknown) => e);
  assert.ok(err instanceof ProviderError, `expected ProviderError, got ${String(err)}`);
  assert.equal(err.kind, kind);
  assert.ok(!JSON.stringify(err).includes(KEY) && !err.message.includes(KEY) && !String(err.stack).includes(KEY), "error leaks the key");
  return err;
};
const abortable = (_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
  init.signal!.addEventListener("abort", () => reject(new Error(`aborted with ${KEY}`)));
});

test("success maps request and response, pins the model and records parameters", async () => {
  const { p, calls } = provider(async () => ok());
  const res = await p.complete(request({ responseFormat: "json_object", maxOutputTokens: 32, temperature: 0.2 }));
  assert.equal(calls[0]!.url, "https://api.mistral.ai/v1/chat/completions");
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.deepEqual(sent, { model: "mistral-small-2506", messages: [{ role: "user", content: "hi" }], max_tokens: 32, temperature: 0.2, stream: false, response_format: { type: "json_object" } });
  assert.equal((calls[0]!.init.headers as Record<string, string>).authorization, `Bearer ${KEY}`);
  assert.equal(res.text, "hello");
  assert.equal(res.requestedModel, "mistral-small-2506");
  assert.equal(res.returnedModel, "mistral-small-2506");
  assert.deepEqual(res.usage, { inputTokens: 5, outputTokens: 2 });
  assert.deepEqual(res.parameters, { temperature: 0.2, maxOutputTokens: 32, responseFormat: "json_object" });
  assert.ok(Number.isFinite(res.latencyMs) && res.latencyMs >= 0);
  assert.equal(modelIdentityMatches(res), true);
  assert.equal(p.capabilities.verified, false);
});

test("text format sends no response_format; custom baseUrl is honoured; missing usage stays undefined", async () => {
  const { p, calls } = provider(async () => ok({ usage: undefined }), { baseUrl: "http://127.0.0.1:9999/proxy/" });
  const res = await p.complete(request());
  assert.equal(calls[0]!.url, "http://127.0.0.1:9999/proxy/v1/chat/completions");
  assert.ok(!("response_format" in JSON.parse(calls[0]!.init.body as string)));
  assert.equal(res.usage, undefined);
});

test("HTTP error maps to kind http with status, without retrying or echoing the body", async () => {
  const { p, calls } = provider(async () => new Response(`{"message":"bad key ${KEY}"}`, { status: 401 }));
  const err = await rejects(p.complete(request()), "http");
  assert.equal(err.status, 401);
  assert.equal(calls.length, 1, "no retry");
  const failing = provider(async () => { throw new Error(`connect failed, auth ${KEY}`); });
  await rejects(failing.p.complete(request()), "http");
  assert.equal(failing.calls.length, 1);
});

test("malformed bodies map to malformed_response", async () => {
  for (const body of ["not json", "{}", JSON.stringify({ choices: [] }), JSON.stringify({ choices: [{ message: { content: 5 } }] })]) {
    await rejects(provider(async () => new Response(body, { status: 200 })).p.complete(request()), "malformed_response");
  }
});

test("timeout and cancellation are distinct kinds and abort the fetch", async () => {
  await rejects(provider(abortable).p.complete(request({ timeoutMs: 20 })), "timeout");
  const controller = new AbortController();
  const pending = provider(abortable).p.complete(request({ signal: controller.signal, timeoutMs: 5000 }));
  setTimeout(() => controller.abort(), 10);
  await rejects(pending, "cancelled");
  const already = new AbortController(); already.abort();
  const { p, calls } = provider(async () => ok());
  await rejects(p.complete(request({ signal: already.signal })), "cancelled");
  assert.equal(calls.length, 0, "an already-cancelled request is never sent");
});

test("missing key or bad config fails with kind config before any request", async () => {
  const { p, calls } = provider(async () => ok(), { env: {} });
  const err = await rejects(p.complete(request()), "config");
  assert.match(err.message, /ADAPTIVE_MISTRAL_API_KEY/);
  assert.equal(calls.length, 0);
  assert.throws(() => new MistralProvider({ apiKeyEnv: KEY, model: "m" }), (e) => e instanceof ProviderError && e.kind === "config" && !e.message.includes(KEY), "a key passed as apiKeyEnv is rejected without echoing it");
  assert.throws(() => new MistralProvider({ apiKeyEnv: "K", model: "" }), ProviderError);
  assert.throws(() => new MistralProvider({ apiKeyEnv: "K", model: "m", baseUrl: "http://api.example.com" }), ProviderError);
});

test("the key never appears in the response record or serialized provider", async () => {
  const { p } = provider(async () => ok());
  const res = await p.complete(request());
  assert.ok(!JSON.stringify(res).includes(KEY));
  assert.ok(!JSON.stringify(p).includes(KEY) && !String(p).includes(KEY));
});

test("a returned model id that differs from the pinned one is recorded, not hidden", async () => {
  const res = await provider(async () => ok({ model: "mistral-large-2411" })).p.complete(request());
  assert.equal(res.requestedModel, "mistral-small-2506");
  assert.equal(res.returnedModel, "mistral-large-2411");
  assert.equal(modelIdentityMatches(res), false);
  const none = await provider(async () => ok({ model: undefined })).p.complete(request());
  assert.equal(none.returnedModel, undefined);
  assert.equal(modelIdentityMatches(none), false);
});

test("preflight observes json_object handling through the injected fetch only", async () => {
  const { p, calls } = provider(async () => ok({ choices: [{ message: { content: '{"ok": true}' } }] }));
  const result = await p.preflight();
  assert.equal(result.jsonObjectHonoured, true);
  assert.equal(result.returnedModel, "mistral-small-2506");
  assert.equal(JSON.parse(calls[0]!.init.body as string).response_format.type, "json_object");
  assert.equal(p.capabilities.verified, false);
});
