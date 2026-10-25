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
