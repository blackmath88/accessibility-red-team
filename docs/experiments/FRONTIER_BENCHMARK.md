# Frontier benchmark: design notes

Status: design only. No live runs, no results. This document describes how the comparison conditions are wired in the harness so that later runs can be read correctly. Historical trials 1–3 (ADAPTIVE_MISTRAL.md) are not re-scored and not retrofitted.

## Conditions

Each run takes an `ExplorationCondition` (`art/adaptive-condition/v1`) on the run options; it is not part of `SessionConfig`, so `configHash` does not change. `result.json` records the condition and the skill version actually loaded (`pinned.skillVersion`, `pinned.skillSha256`).

| Flag | Off (condition A) | On |
|---|---|---|
| `ledgerVisible` | observation has no `frontier` key | bounded `frontier` field plus `frontier-shown.jsonl` |
| `completionAccounting` | `result.completion` is `null` | controller classifies completion from the ledger |
| `incrementalCandidates` | `report_candidate` is refused as an unknown type | `report_candidate` is legal; duplicates are recorded as such |
| `selector` | `model` | `scheduler` is refused until it exists |

- **Condition A** has all flags off. It loads skill v3 and sends the same prompts as trial 3. Its only artifact differences are `frontier.json` and the `condition` / `completion: null` fields in `result.json`.
- **Ledger-hidden control:** `completionAccounting` and `incrementalCandidates` on, `ledgerVisible` off. It loads skill v4, but its observations are identical to condition A's apart from the timestamp and the remaining wall-clock budget. A test enforces this. Any difference between B and this control is therefore due to visibility, not to the shared repairs.
- **B:** all three flags on, same model as A.
- **C:** the same as B, with a stronger pinned model.
- **D:** the deterministic scheduler. Not built yet.

`report_candidate` is deliberately not added to `legal.simple`. Simple actions are not enforced from that list, and adding it would make the ledger-hidden control's observations differ from A's. It is documented in skill v4 instead, identically for B and the control.

## Ledger and provenance

`frontier.json` (`art/adaptive-frontier/v1`) is written after every turn and on every terminal path, whatever the condition.
- An obligation becomes executed only through an evidence record of a probing action on that page. Navigation is not a probe, visited is not tested, and tested is not passed.
- Policy denials of a navigation to a known page mark that page's obligations as blocked. A URL the model invents never becomes a page.

## Completion accounting

A finish verdict is stored as `completion.proposal`. The controller decides `completion.outcome`:
- `cancelled`: the caller aborted the run.
- `exhausted`: `budget_exhausted` or `timeout` ended the session.
- `partial`: relevant reachable obligations are still pending, or the ledger hit a bound, or the session ended with an error.
- `blocked`: nothing relevant is pending, but at least one obligation was blocked by policy.
- `complete_within_scope`: none of the above, and the session ended normally.

**Relevant reachable** means:
- the obligation is pending, whatever its applicability (an unvisited page's skip-link check is `unknown` and still counts);
- its page was visited or listed in `legal.navigate`;
- its page is within the declared sampling scope.

**Sampling rule** (`condition.sampling.maxPagesPerSource`, default 6, minimum 2): per discovery source (the page a link was first seen on), only the first N pages in discovery order count. Pages are never chosen by URL or link text. Pages past N, unreachable pages, deferred obligations and blocked obligations are listed in `completion.exclusions` with reasons. Both lists are bounded and report truncation counts.

Accounting does not force exploration: hard caps on steps, calls, tokens, wall time and surfaces are unchanged, and the session still ends when the model finishes.

## Model-visible omissions

- `frontier.json` lists turns where `legal.navigate` showed fewer pages than the navigable links (`modelVisibleClipping`).
- With `ledgerVisible`, `frontier-shown.jsonl` records for every turn what the compact view showed, what its bounds clipped, and which discovered pages were neither visited nor legal that turn.

## Scoring (to be built)

Score each defect through these stages: discovered -> model-visible -> selected -> visited -> probe executed -> interpreted -> evidence-backed reported. Score exploration and interpretation separately. There is no credit for a visit without its probe, for self-reported coverage, or for duplicate candidates.
