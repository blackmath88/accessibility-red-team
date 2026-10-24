# Adaptive track: Mistral adapter (S3, mocked)

Status: implemented and tested against a fake `fetch` only. **No real call has been made, and none is authorised** until the owner approves the credential source, the model and a spend cap (build plan, S3).

Code: `src/experimental/adaptive/providers/mistral.ts` implements `ModelProvider` from `src/experimental/adaptive/provider.ts`. Tests: `test/adaptive-mistral.test.ts`. Nothing outside `src/experimental/` imports it.

## Configuration

```ts
new MistralProvider({
  apiKeyEnv: "ADAPTIVE_MISTRAL_API_KEY", // NAME of the env var; the key itself is never accepted as config
  model: "<pinned model id>",            // required, sent verbatim, no default
  baseUrl: "https://api.mistral.ai",     // optional; https only (http allowed for loopback)
});
```

- The key is read from the named variable at each `complete()` call. If it is unset, the call fails with `ProviderError("config")` before any request.
- The key is sent only as the `Authorization` header. It is not logged, put in error messages, or reachable by serialising the provider (environment and fetch are `#private`). Transport error messages are dropped, because they can echo request details; HTTP errors report the status only, not the response body.
- `POST {baseUrl}/v1/chat/completions`, non-streaming. `responseFormat: "json_object"` becomes `response_format: {"type": "json_object"}`; `text` sends none.
- `timeoutMs` and `AbortSignal` are enforced and distinguishable: `timeout` vs `cancelled`. A request already cancelled is never sent. There are no retries and no fallback provider; any failure surfaces as a `ProviderError`.

## What is recorded per call

`requestedModel` (pinned), `returnedModel` (as reported by Mistral, may be absent), `usage`, `latencyMs`, and the request `parameters`. Mistral may answer an alias such as a `*-latest` id with a dated id, so a difference is not an error; it is recorded, and `modelIdentityMatches(response)` lets a session log flag it. Nothing is silently normalised.

## Data destination

Every request sends its messages to Mistral's API (`api.mistral.ai` by default, a third-party service). If a session builds prompts from page content, **website text, DOM snippets and any screenshots leave the host**. Retention and training terms are Mistral's and have not been reviewed here. Do not point this at private, authenticated or personal-data pages without that review.

## Unverified

- `capabilities` is declared (`jsonObject`, `jsonSchema`, `toolCalling` true; `vision` false because it is model-dependent) with `verified: false`. No endpoint or model capability has been observed.
- `preflight()` makes one tiny real call and reports whether `json_object` output was honoured and which model id came back. It is not run by tests or CI, needs the same approval as any live call, and does not flip `verified`; json schema, tools and vision stay unobserved.
- Response shape was written from the public chat-completions format, not from a live response. Array-style message content (multi-part) is rejected as `malformed_response`.
- Pricing, rate limits and whether the pinned model accepts the parameters used are unknown.

## Before any live call

The owner must approve: where the key comes from (an env var set outside the repo; never pasted in chat or committed), the exact model id, and a currency cap, plus the targets. Suggested bounds in the build plan (20 model calls, token caps) are proposals, not authority. Enforcing budgets is the session harness's job (S1), not this adapter's.
