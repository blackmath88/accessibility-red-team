# Decision replay preparation and frontier accounting audit

Packet A, 2026-10-25. Base: `3065bc2fe655c325b360c20b2480fbfb0fd77722`.
This is an isolated mechanism smoke under `src/experimental/adaptive/replay/`.
It makes **no benchmark quality claim** and changes no production journey or outcome.

## Provenance and frozen inputs

Exact trial-3 model-visible messages are absent on this host. Historical extraction is
**blocked**, recorded in the typed manifest's `historicalExtraction.status`; no historical
message was reconstructed from FRONTIER_DIAGNOSIS or other narrative summaries.
All packets carry `provenance: "synthetic_local_smoke"`. Here, `original` means the
synthetic baseline, not a historical original. The two invented decision points are:

- `missed_sibling`: one inspected sibling has an existing main target; another discovered,
  allowed sibling remains unvisited and its behavior is explicitly unknown. Neutral paths
  `/s/a.html` and `/s/b.html` do not encode a seeded defect.
- `dialog_focus`: activation moved focus into a dialog, then Escape closed it and focus was
  observed on body, without a subsequent fresh reproduction. This supports an observed
  focus-return limitation, not a conformance or general barrier finding.

`packets.ts` owns every synthetic observation and transformation. `original` lists the facts
chronologically. `frontier_visible` retains every fact verbatim and appends only derived
harness bookkeeping (including unassessed/follow-up status for the executed dialog probe).
`restructured_evidence` reverses display order and adds stable fact indices, retaining every
observation verbatim. These interventions change presentation/relevance, not observed facts;
tests compare the full fact multiset in every variant.

The committed `manifest.json` pins six SHA-256 values over `JSON.stringify(messages)`, covering
all ordered role/content pairs, including the complete system instruction. Schema validation
recomputes these hashes and rejects drift, duplicate IDs, duplicate matrix cells and malformed
slots. `sourceCodeSha` records the implementation base, not an unavailable historical run;
`packetVersion` identifies these synthetic instructions. Sampling is fixed at temperature 0,
600 output tokens, JSON-object format and a 1000 ms fake-call timeout. No historical skill,
sampling setting or provider identity is claimed.

## Matrix and evaluator isolation

| Dimension | Values | Count |
|---|---|---:|
| Decision point | missed sibling; dialog/focus | 2 |
| Presentation | original; frontier_visible; restructured_evidence | 3 |
| Model slot | current; stronger | 2 |
| Repetition | 1 through 10 | 10 |
| Primary single-response requests | product of the above | **120** |

The current slot records `mistral-small-2603`, already configured in the committed
`trials/frontier-benchmark.v1.json`, with that source path in the manifest. The stronger slot
is explicitly unresolved with `exactModel: null`; no stronger model is invented. These are
experiment metadata, not authorization to execute a provider. Every actual dry-run response
is attributed to `fake-scripted-v1`, independently of its matrix slot. No paid or live provider runs, public scans or credential reads
are part of the smoke.

`evaluator.ts` contains the separate answer object and pure scoring function. The runner,
packet construction, FakeProvider, executor and scheduler never import that evaluator at
runtime. `dry-run.ts` sends packets first and invokes the evaluator on responses afterwards;
there are no provider tools in this single-response replay. Tests compare all provider inputs
under a counterfactual answer key and check both their shape and dependency boundary. The
shared system instruction lists a response vocabulary for all decisions, not an answer key.
The canned fake script deliberately returns expected responses to exercise scoring; its
120/120 scores measure plumbing, not model ability or intervention effectiveness.

Next-action selection and evidence interpretation have independent booleans. Tests include
correct action/wrong interpretation and wrong action/correct interpretation. Optional model
rationales are discarded by replay records; explanations are never stored as beliefs,
diagnoses, or adjudications.

Run the complete no-API matrix and print counters plus the two score totals:

```sh
npx tsx src/experimental/adaptive/replay/dry-run.ts
```

## Request accounting

The manifest always has 120 primary requests, each producing at most one response. The
runner never retries implicitly and never appends a correction or finish-rejection call.
A caller may explicitly supply additional attempts against a known request ID as `retry`
or `finish_rejection_continuation`; these repeat the frozen packet and test accounting only,
not an implemented conversational finish-rejection policy. Extra primary attempts are refused.

`totalRequests = primaryRequests + retries + finishRejectionContinuations`. Malformed responses
and provider errors are orthogonal response counters, not extra requests, successes or dropped
repetitions. Both failed and successful attempts retain their cell ID, attempt kind, packet hash,
model slot and actual fake model. A scripted failure test executes 123 calls: 120 primary,
one retry and two explicitly labelled continuation attempts, with one malformed response and
one provider error. Browser continuation sessions below have their own executor model-call
counts and are excluded from the 120-request frozen matrix.

## Frontier and scheduler findings

The existing frontier's `status` is an **execution status**, even when the compact view calls
its executed records `outcomes`. `inspect_semantics`/`capture_evidence` record an inspection;
activating and escaping a dialog record its probe sequence. They do not establish an
assessment outcome or adjudicate a barrier. The scheduler consumes only the visible compact
frontier, chooses probes, and uses its separate rule table to propose evidence-backed
candidates. A candidate and `complete_within_scope` remain bounded exploration artifacts.
Neither is an adjudication or permission to publish.

No new test exposed a defect requiring a frontier or scheduler code change, so neither was
modified. In particular, an inconclusive model finish cannot change a pending obligation;
existing completion accounting still reports partial/exhausted/cancelled as appropriate.
The legacy completion outcome `complete_within_scope` means probes ran within scope and caps,
not that every barrier was assessed. This interpretation preserves existing condition A–D
behavior rather than silently strengthening old fields.

`accounting.ts` supplies a separate typed audit projection: `execution_status`,
`assessment_outcome`, `follow_up_required`, and always-null `barrier_adjudication`. Its default
for any executed inspection is unassessed with follow-up required. An explicitly supplied
bounded assessment must cite evidence already attached to that executed obligation;
incomplete, inconclusive, error and violation keep follow-up open. Only explicit pass or
inapplicable assessments close that assessment's follow-up, without mutating the execution
ledger or adjudicating any barrier. This projection is an audit helper, not a production
assessment store, reviewer authority or publication-policy implementation.

Tests prove that recorded inspections do not equal adjudication, incomplete/inconclusive
results preserve follow-up, unsupported evidence cannot close work, and ledger-hidden versus
visible conditions remain attributable. Matched runs have equal obligations while the visible
condition alone sends/logs the compact frontier. Existing containment, budget, cancellation,
evaluator-truth isolation and all five journey outcomes remain unchanged.

## Short localhost continuations and recovery

`adaptive-accounting.test.ts` reuses the contained fixture browser, fixture server, FakeProvider,
executor budgets and deterministic FrontierScheduler. It covers:

- Late capture just before a forced final finish, following a denied malformed action.
- Repeated premature complete-finish proposals, each still recorded as partial with pending work.
- Dialog Escape unexpectedly leaving focus on body, followed by a targeted capture.
- Cancellation while a fake reply arrives, fencing that reply and preserving earlier evidence.
- Call-budget exhaustion and wall-budget expiry with pending obligations preserved.
- Persisted frontier recovery, schema rejection of incomplete artifacts, and a separate fresh
  scheduler execution that visits the missed sibling without changing the old artifact.

The current executor accepts `finish`, classifies completion and stops; it does not reject
finish into another turn. Consequently repeated-finish continuations are explicitly separate
fresh browser sessions, each with its own recorded calls, not a claimed in-session recovery
policy. Artifacts can be loaded and validated with `recoverLedger`; browser state, scheduler
queues, pending provider calls and executor counters are **not resumable**. The recovery test
starts a fresh scheduler session and leaves the old ledger untouched. No general persistence
or resumable execution engine was added.

## Validation

The known aggregate-check failure is in the existing
`test/adaptive-arms.test.ts:147` malicious-fixture comparison: it asserts that arm A ended in
error and that `dynamicAdvantage.comparable` is false, but the observed value is true. The
same assertion fails on exact base `3065bc2fe655c325b360c20b2480fbfb0fd77722`, extracted with
`git archive` into a temporary directory and tested using the same installed dependencies:
`npx tsx --test test/adaptive-arms.test.ts` reports **18 pass, 1 fail**, with no skips or
cancellations. This unrelated expectation was left unchanged; the packet does not claim a
green aggregate suite or infer an experimental advantage from that fixture.

Final checks on this packet (no skips or cancellations):

| Command | Result |
|---|---|
| `npm run build` | PASS, TypeScript exits 0 |
| `npx tsx --test test/adaptive-*.test.ts` | 175 tests: 174 pass, 1 pre-existing failure |
| `npm test` | 258 tests: 257 pass, the same 1 pre-existing failure |
| `npx tsx --test test/adaptive-replay.test.ts` | 6 tests: 6 pass, 0 fail |
| `npx tsx src/experimental/adaptive/replay/dry-run.ts` | 120 primary requests; 0 retry, continuation, malformed or provider-error counts; 120 action and 120 interpretation scripted scores |
| Exact-base `npx tsx --test test/adaptive-arms.test.ts` | 19 tests: 18 pass, the identical 1 failure |

All 16 newly added replay/accounting tests pass within the aggregate runs. `npm ci` was
run once for setup. The only blockers to historical/live interpretation remain the absent
historical messages and unresolved stronger model; no live experiment was attempted.
