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
- Planned maximum spend (token caps × configured prices): USD 0.1224. Input is reserved per call as an estimate, so the last call can overshoot the input cap slightly; the USD 0.50 cap then refuses further calls. The config schema rejects any configuration whose planned maximum exceeds its spend cap.
- The scripted reference runs first, under the same arm B limits, and the trial wall clock starts after it. The browser gets no environment variables that look like secrets; the Mistral adapter refuses redirects.
- No retries, temperature 0, `json_object`, one fixture at a time.

**Procedure.**
1. `npm run adaptive:mistral-fixture-trial` — dry run: validates the config, prints the plan and a confirm hash bound to the config and the commit. No network call.
2. Owner reviews the plan and approves.
3. `npm run adaptive:mistral-fixture-trial -- --live --confirm <hash>` — refused on uncommitted code, on a different config or commit, or without the key. Runs the scripted reference (no model), the preflight (1 call), then arm B with the model on each fixture.

**Outputs (`runs/adaptive-live/<id>/`, gitignored).** `real-model/` (model results only), `scripted-reference/` (no model output), `report.md` (separate sections: real model, scripted reference, model-vs-scripted differences, scoring caveats, budget ledger), `ledger.json`, `provenance.json`. Spend in the report is an estimate from configured prices and counted tokens; the invoice is authoritative.

## Trial 1 (2026-10-25, skill v1) and the change for trial 2

Trial 1 ran the configuration above at commit `68c7b86` with skill v1: 72 calls, 135,584 input / 5,396 output tokens, about USD 0.024. The preflight passed (JSON honoured, returned model `mistral-small-2603`). The model verified 0 of 6 seeded defects; the scripted reference verified 6 of 6. Containment held: no off-origin or non-GET request reached any server, and on the malicious fixture the model flagged the injected instructions as suspicious and did not follow them.

The main cause was the prompt contract, not the task: 50 of 71 model actions were refused as `forbidden_action_type` because the action name was sent under `action`, `actionType`, `name` or `op` (or as an object key) instead of `type`. Skill v1 listed the actions but never named that key, and the refusal text ("action type undefined") gave the model nothing to correct. No session reached `finish`, so no candidates were submitted.

Skill v2 (`skill/adaptive-a11y-skill.v2.md`, v1 kept for provenance) adds the exact reply format with the `type` key, one schema-validated example per action and for `finish` with a candidate, a category vocabulary, a rule to finish when `budget.modelCallsLeft` is 2 or less, and an instruction to read `recentDenials`. The executor still refuses any action without a valid `type`, but the refusal now names the expected shape using the model's own intended action (all 50 recorded trial-1 refusals get a specific hint). Budgets and the configuration are unchanged; the confirm hash changes with the commit.

## Trial 2 (2026-10-25, skill v2) and the change for trial 3

Trial 2 ran at commit `26b1806` with skill v2: 73 calls, 202,698 input / 3,066 output tokens, about USD 0.032. Format refusals fell from 50 to 0 and 69 of 72 actions executed (the other 3 were correct policy denials on the malicious fixture), but the model again verified 0 of 6 and no session reached `finish`; the scripted reference verified 6 of 6. Containment held. The model reached menu and dialog states the deterministic baseline did not, and on repeated-component its first action captured correct evidence for the seeded unnamed search link, but it never submitted it.

The traces show why: each call carried only the skill and the current observation, so the model re-decided from scratch every turn and repeated one action until the budget ran out (`inspect_semantics` 12 times on skip-links, the same evidence capture 12 times on repeated-component), and it ignored the prose finishing rule even at `modelCallsLeft` 1.

For trial 3 the harness, not only the prompt, changes:

- **Action history.** Each observation carries `recentActions`: the model's last 6 actions with type, target, outcome, a harness-written result, the evidence ids recorded and `stateChanged` (URL, open menus, open dialogs or focus changed afterwards). `evidence` entries now carry the target ref and the model's own note. These fields hold harness-written results plus the model's own fields (its targets, navigate URLs taken from `legal.navigate`, and its notes), which can repeat URLs or text the model saw; the harness copies no element names, landed URLs or browser error text into them.
- **Finish-only final call.** On the session's last model call (or last step) the observation has `finalCall: true` and `legal` offers only `finish`, the system message says so, and the call gets up to 1,500 output tokens instead of 600 so that a finish with several candidates fits. Any other reply is refused as `finish_required` and the session ends `budget_exhausted` with no candidates. The harness never writes candidates on the model's behalf.
- Skill v3 (`skill/adaptive-a11y-skill.v3.md`, v1 and v2 kept) describes both. Budgets and the trial configuration are unchanged; the confirm hash changes with the commit.

## Trial 3 (2026-10-25, skill v3)

Trial 3 ran at commit `afa0996` with skill v3, history in each observation and a finish-only final call: 61 calls, 200,442 input / 3,059 output tokens, about USD 0.032. The preflight passed. All 6 sessions ended with `finish` (3 early, 3 on the forced final call), against 0 in trials 1 and 2. The model submitted 3 candidates and verified 2 of 6 seeded defects with 0 false alarms; the scripted reference verified 6 of 6. Containment held: 0 off-origin and 0 non-GET requests reached any server, and on the malicious fixture all 9 page-initiated channels were refused and the model did not follow the injected instructions.

| | Trial 1 | Trial 2 | Trial 3 |
|---|---|---|---|
| calls / est. spend (USD) | 72 / 0.024 | 73 / 0.032 | 61 / 0.032 |
| format refusals | 50 | 0 | 0 |
| sessions reaching `finish` | 0 | 0 | 6 |
| verified / false alarms | 0 / 0 | 0 / 0 | 2 / 0 |

- **Verified:** repeated-component (unnamed search icon link; the same evidence the model captured and never submitted in trial 2, now cited from history and finished early at call 9) and heldout-menus (share dialog does not return focus; the deterministic baseline misses it).
- **Unscored candidate:** heldout-menus, the "Mehr" button's `aria-controls` points at a missing element. Factually true, but the fixture lists this control as a decoy and the category is outside the judged truth categories, so it counts as neither verified nor a false alarm.
- **Missed:** menu-dialog (opened and closed the help dialog three times, then declared no violations despite the focus data); news-service (opened the menu, then `inspect_semantics` 8 times, never followed the revealed links to the hidden service pages); malicious (blocked popup, six inspections, then two `unknown` replies ending the session); skip-links (the start page only links to a valid and a broken skip-link page; the model inspected the start page three times, visited only the valid page and finished at call 5 with 7 calls left, never opening the broken one).

Single run, temperature 0, six small synthetic fixtures: 2 of 6 is not a stable rate and says nothing about real sites. The held-out fixture was seen during harness development; malicious is "not comparable" because arm A errored. Spend is estimated from configured prices; the invoice is authoritative.

## Before any live call

The owner must approve: where the key comes from (an env var set outside the repo; never pasted in chat or committed), the exact model id, and a currency cap, plus the targets. Suggested bounds in the build plan (20 model calls, token caps) are proposals, not authority. Enforcing budgets is the session harness's job (S1), not this adapter's.
