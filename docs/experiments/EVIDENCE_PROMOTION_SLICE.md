# Evidence-promotion slice — current versus target (packet 0)

Date: 2026-10-25. Implements packets 0–3 of [NUC_ARCHITECTURE_BUILD_PLAN.md](NUC_ARCHITECTURE_BUILD_PLAN.md)
under proposed [ADR-0014](../adr/0014-exploration-adjudication-promotion.md).

## Verified base

| Item | Value |
|---|---|
| main (fetched on the NUC) | e7e0fc9f2d3319c271fdca9208cdd9cc0c5feb39 — unchanged since the plan was written |
| Plan head (PR #46) | aa3fbe2582651577b9c969b1915c3cdb3afdd47d — docs copied, PR #46 left unchanged |
| Weavr | No project or mission references this repository; none was created or dispatched |
| Observatory | C4–C6 and D1–D4 declared, no gates; no snapshot at the configured path |
| Baseline `npm run check` on main | Build passes; browser tests need Playwright Chromium installed on the host first |

## Current versus target

| Area | Current main | This slice |
|---|---|---|
| Frontier ledger | `src/experimental/adaptive/frontier.ts`, `scheduler.ts`, completion tests (PR #45) | Audited and extended in place, not rebuilt |
| Decision replay | Fixture trials and fake provider; no frozen decision packets | Synthetic packet families, 120-request manifest, fake-provider dry run |
| Historical trial-3 traces | Gitignored; absent on this NUC (searched) | Historical extraction **blocked**; no reconstruction from narrative |
| Skip-link check | Private `skipLinkJourney` in `src/journeys/engine.ts` | Minimal extraction, wrapped by one typed catalogue entry |
| Catalogue / promotion | `src/learning/contracts.ts` CandidateCheck vocabulary; aria-controls classifier validation | Typed registry entry and a review gate; no generic promotion service |
| Assessment / adjudication / publication | Journey and report contracts only | Separate evidence contracts and a pure publication-policy function |
| Production report path | Unchanged | Not connected to the policy in this slice |

Details of what each packet implemented, mocked or left unconnected are recorded in the packet sections below.

## Packet outcomes

| Packet | Commits | Result | Detail |
|---|---|---|---|
| 1 Replay and accounting audit | c492b3a | Implemented with synthetic inputs; historical replay blocked | [DECISION_REPLAY.md](DECISION_REPLAY.md) |
| 2 Typed skip-link probe and gate | af29f88, ace766e (gate repair) | Implemented; entry remains `candidate` | [SKIP_LINK_SAME_PAGE.md](../catalogue/SKIP_LINK_SAME_PAGE.md) |
| 3 Evidence and publication contracts | a249079 | Pure policy implemented; production callers unconnected | [EVIDENCE_CONTRACTS.md](EVIDENCE_CONTRACTS.md) |

## Implemented, mocked and live-observed

- Implemented and exercised locally: skip-link extraction and malformed-fragment abstention, the typed catalogue
  entry, digest-bound review gate, evidence records, publication and retest policy, replay manifest and accounting.
- Browser-observed on local fixtures only: six skip-link challenge cases in fresh Chromium contexts
  (0 false positives, 0 false negatives, 3 abstentions), and contained localhost frontier continuations.
- Mocked: every model response (fake provider), all reviewer records and evidence receipts, and both replay
  decision packets (`synthetic_local_smoke`). No real human sign-off exists, and the probe is not trusted.
- Not performed: paid or live model calls, public scans, report/watch/export wiring, outreach, merge or deployment.

## Combined checks on the integrated branch

| Command | Result |
|---|---|
| `npm run build` | Pass |
| `npm test` | 305 pass, 1 fail. `adaptive-arms.test.ts:147` also fails 18/1 on unmodified main e7e0fc9 |
| `python3 .github/check-public-docs.py` | Pass |
| `npx tsx src/experimental/adaptive/replay/dry-run.ts` | 120 fake requests; 120 next-action and 120 interpretation scores; no quality claim |
| `npm run adaptive:frontier-local` | Completed with scripted stand-ins and the scheduler; no model calls |
| `npm run adaptive:frontier-benchmark` | Refused by design (exit 2): the stronger model, its pricing and the budget are owner-supplied and missing |

`npm test` on this host can keep its handles open after the adaptive-arms setup hook passes 120 s under parallel
load. A run without competing load finishes normally.
