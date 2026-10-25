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

## Fixture trial with the real model (prepared, not yet run)

Runner: `src/experimental/adaptive/live-trial.ts`, configuration `src/experimental/adaptive/trials/mistral-fixture-trial.v1.json`, script `npm run adaptive:mistral-fixture-trial`. Tests: `test/adaptive-live-trial.test.ts` (no network).

**Model.** `mistral-small-2603` (Mistral Small 4, 26.03): 256k context, structured outputs and function calling per the model card, USD 0.15 / 0.60 per 1M input / output tokens (model card, checked 2026-10-25). The id is pinned; aliases (`*-latest`) are rejected by the config schema, and the preflight aborts the trial if the returned model id differs. Other models are possible by editing the config (which changes the confirm hash); the Medium 3.5 card did not show a clean API id, so it is not proposed.

**Credentials.** The key never goes into the repo, a config file, a prompt, chat or a log. The runner reads it from the environment variable named in the config (`ADAPTIVE_MISTRAL_API_KEY`) and sends it only as the `Authorization` header.

1. In the Mistral console, create a key used only for this experiment and set a workspace spend limit there as a second, provider-side cap.
2. In the shell that will run the trial, load it without echoing it or writing it to shell history, either from a password manager (`export ADAPTIVE_MISTRAL_API_KEY="$(pass show mistral/adaptive-trial)"`) or typed once (`read -rs ADAPTIVE_MISTRAL_API_KEY && export ADAPTIVE_MISTRAL_API_KEY`).
3. Check presence only: the dry run prints `set (value not shown)`.
4. After the run: `unset ADAPTIVE_MISTRAL_API_KEY`, and revoke the key if the experiment is over.

**Limits (all hard, enforced in code, not by the prompt).**
- Per session (executor): 12 model calls, 24 steps, 120,000 input / 4,000 output tokens, 180 s, 8 surfaces; at most 600 output tokens and 30 s per call.
- Whole trial (`BudgetedProvider`): 73 calls (6 fixtures × 12 + 1 preflight), 720,000 input / 24,016 output tokens, 25 min wall clock, at least 1.1 s between calls, spend cap USD 0.50. Before each call the worst case (input estimate × 1.5 plus the full requested output) is checked against every cap and the call is refused if it could break one. Failed calls and calls without reported usage count at their reserved worst case.
- Worst-case spend if every token cap is used: USD 0.1224. The config schema rejects any configuration whose worst case exceeds its spend cap.
- No retries, temperature 0, `json_object`, one fixture at a time.

**Procedure.**
1. `npm run adaptive:mistral-fixture-trial` — dry run: validates the config, prints the plan and a confirm hash bound to the config and the commit. No network call.
2. Owner reviews the plan and approves.
3. `npm run adaptive:mistral-fixture-trial -- --live --confirm <hash>` — refused on uncommitted code, on a different config or commit, or without the key. Runs the scripted reference (no model), the preflight (1 call), then arm B with the model on each fixture.

**Outputs (`runs/adaptive-live/<id>/`, gitignored).** `real-model/` (model results only), `scripted-reference/` (no model output), `report.md` (separate sections: real model, scripted reference, model-vs-scripted differences, scoring caveats, budget ledger), `ledger.json`, `provenance.json`. Spend in the report is an estimate from configured prices and counted tokens; the invoice is authoritative.

## Before any live call

The owner must approve: where the key comes from (an env var set outside the repo; never pasted in chat or committed), the exact model id, and a currency cap, plus the targets. Suggested bounds in the build plan (20 model calls, token caps) are proposals, not authority. Enforcing budgets is the session harness's job (S1), not this adapter's.
