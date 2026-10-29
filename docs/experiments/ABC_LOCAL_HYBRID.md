# A/B/C: algorithmic, local LLM, local LLM + bounded Mistral (2026-10-29)

Brief: `docs/experiments/CLAUDE_SENIOR_DEV_120_MIN.md` (branch `plan/nebu-local-experiment-20261027`, commit `434efa9`).
Experimental track only (`src/experimental/adaptive/`); nothing here is imported by production code. Fixtures are the
neutral DEVELOPMENT variants `dev-k1..k3`: exposed during development, never held out. Three synthetic fixtures cannot
substantiate reliability, novelty or municipal applicability.

Results and the visual report: `docs/experiments/abc-report/` (German). Raw runs are archived outside git (manifest and
checksum in the report folder).

## Setup (verified, not remembered)

- Host: Nebu, the local machine. Ollama 0.33.3, user process on loopback (endpoint from `ADAPTIVE_LOCAL_ENDPOINT`). The installed build ships **CPU backends only**: the Intel
  Arc Pro B60 is not used (no Vulkan/SYCL library installed; installing one was out of scope). Inference is CPU-bound
  (Ryzen 7 3700X): about 10-24 s per decision with 3.7-5k prompt tokens.
- Local model: `qwen3:1.7b` (Q4_K_M) as `qwen3-1.7b-ctx8k` (a local Modelfile setting `num_ctx 8192`; the default 4096
  would truncate the ~4-5k-token prompts silently). Reasoning off (`reasoning_effort: "none"`), temperature 0, JSON mode.
  Returned model id is checked in a preflight.
- `qwen3:4b` was preflighted and rejected: it echoed the observation JSON instead of choosing an action (600/600 tokens,
  36-125 s per call).
- Consultant: `mistral-small-2603` (pinned; USD 0.15 / 0.60 per 1M tokens as configured). Owner cap USD 5 in total.

## Conditions

All three use identical caps (12 decision slots, 24 browser steps, 8 surfaces, 180 s wall, 30 s per request, 1500-token
final call; in C the local call on a consultation turn gets the remainder of the 30 s after the 1.1-2.2 s consultation),
the same contained browser, the same fixtures in the same order, and the frontier-B harness flags (visible
ledger, completion accounting, `report_candidate`).

- **A, algorithmic**: the existing frontier scheduler and rule table (`frontier-scheduler/v1`, `frontier-rules/v1`), no model.
- **B, local LLM**: the local model is the exploration policy through the existing chat adapter (`MistralProvider` on an
  `http` loopback base URL, which it already allowed; new optional `extraBody` for the reasoning switch).
- **C, local LLM + Mistral** (`hybrid.ts`, `hybrid-escalation/v1`, frozen before runs): the local model stays the policy.
  A consultation happens only when the last 3 recorded actions all changed no state, never on the final call, at most 2 per
  session, at least 3 local decisions apart. Mistral receives the same bounded observation the local model already saw and
  returns a typed advisory (interpretation, optional suggested action, evidence refs). The controller drops unknown evidence
  refs and suggested actions that are not legal in that observation; the local model receives the rest as advisory text.
  Mistral has no browser, code or shell capability and cannot change scope or budgets. Each consultation and local call is
  logged in order to `hybrid.jsonl`. C therefore uses more compute than B (up to 14 provider requests); this compares
  practical systems, not equal call budgets.

The runner (`npm run adaptive:abc`) is a dry run by default; `--live` needs the printed confirm hash (plan + code SHA) and
committed code. Before measured sessions it evaluates the skill prompt once (warm-up), because the smoke run showed the
cold prompt evaluation alone exceeds the 30 s request cap on CPU and would penalise whichever arm ran first.

## Segments

- `smoke` (dev-k1 only): wiring check. B timed out on its first (cold) call: the reason for the warm-up.
- `s1` (code `f003529`): all 9 sessions, no repair.
- `s2` (code `ae1ecc9`): all 9 sessions with the one repair below, applied to every arm.

## The one repair: repeat-guard

Observed in s1: in 5 of 6 model sessions the local model repeated the same `capture_evidence`/`inspect_semantics` in an
unchanged page state (up to 10 times), never left the start page (1 of 3-5 discovered pages visited in every B and C
session), and 4 of 6 ended without reporting anything (wall timeout or invalid output).

Change (`refuseRepeatInSameState`, opt-in executor option, default off so historical runs are unchanged): an
`inspect_semantics` or `capture_evidence` identical to one already executed in the identical page state (same URL, open
menus/dialogs, focus) is refused as `repeated_in_same_state`, naming the evidence it already produced and pointing at
reporting it or moving to outstanding work. Regression tests: off by default; on, the second identical capture is refused.
It is a tool/accounting change, so any s1→s2 difference is attributed to the harness change, not to a model.

## Also observed

- **Copied example, fabricated claim**: in dev-k2 (B and C) the local model reproduced the skill's `finish` example
  verbatim ("search-btn", "Menu revealed two service pages"), truncated at the output cap (invalid JSON). In s1 dev-k1 C it
  submitted that example claim as a finding; the blind judge classified it as contradicted by its own cited evidence.
- Judging is model-assisted research evaluation (fresh Claude contexts, anonymized arm ids, no truth, no costs). The s1
  packets were built before the review fixes: three A packets still carried the scheduler's fixed finish sentence and every
  packet carried the session end status, so s1 judging was only partly blind; s2 packets were scrubbed (origins, fixture
  names, fixed sentences, status), though A's templated claim wording stays recognisable, reconciled afterwards with fixture truth and a fresh-browser replay. It is not human adjudication,
  approval or authority to publish or promote anything.

## Results (completed runs; see `abc-report/`)

| Segment | A credited | B credited | C credited | Judge: supported / contradicted (A, B, C) | Mistral USD |
|---|---|---|---|---|---|
| s1 (no repair) | 4/4 | 0/4 | 0/4 | A 4/0, B 0/0, C 0/1 | 0.0008 |
| s2 (repeat-guard) | 4/4 | 0/4 | 0/4 | A 4/0, B 0/0, C 0/0 | 0.0017 |

Smoke added USD 0.0009; total USD 0.0034 of the USD 5 cap. 83 local calls: median 18.1 s, p90 22.4 s. No consultation
caused a timeout (each 1.1-2.2 s). The repeat-guard fired 21 times in s2 without changing any outcome: a negative result.
Blind verdicts agreed with fixture truth for every claim. Fresh-browser replay confirmed the dev-k3 focus defect, the dev-k1
missing skip target and the dev-k2 unnamed button; a one-line repaired copy of dev-k3 returned focus correctly.

Review (independent, static, Opus via Orca, `cb3fa92`): no safety blocker; findings on packet blinding, C's per-request time
split, consultant-authored finish suggestions, ledger persistence, the owner cap and repair verification were fixed after the
runs (they do not change the code that ran s1/s2) or are disclosed above and in the report.
