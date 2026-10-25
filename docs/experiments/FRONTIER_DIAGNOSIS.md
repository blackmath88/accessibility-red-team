# Frontier diagnosis: Mistral fixture trial 3

Date: 2026-10-25. Source: the raw trial-3 session artifacts (commit afa0996, mistral-small-2603). These are local and gitignored and were read without being copied. This document records the diagnosis that motivates the frontier ledger. It does not change the historical record in ADAPTIVE_MISTRAL.md.

Each seeded defect is traced through these stages: discovered -> model-visible -> selected -> visited -> probed -> interpreted -> reported.

| Fixture | Discovered | Model-visible | Selected | Visited | Probed | Interpreted | Failure class |
|---|---|---|---|---|---|---|---|
| skip-links (broken sibling) | yes, step 0 | yes, every turn (links and `legal.navigate`), not clipped | no | no | no | – | selection + premature completion |
| news-service (menu-only service page) | yes, step 1 (revealed by the menu) | yes, 10 turns, not clipped | no (`inspect_semantics` x8) | no | no | – | selection |
| menu-dialog (focus return after Escape) | yes | yes | yes | yes | yes | no | interpretation |

## Per fixture

- **skip-links.** broken.html was discovered at step 0. It was listed in `links` and `legal.navigate` on every turn and never clipped, yet it was never selected. The model inspected the start page three times and visited only valid.html. It then finished with verdict "complete" with 8 model calls left. A working sibling was treated as evidence about the broken one.
- **news-service.** Opening the menu revealed dienstleistungen.html at step 1. It stayed visible and unclipped in `legal.navigate` for 10 turns and was never selected; the model called `inspect_semantics` eight times instead.
- **menu-dialog.** After Escape, focus was on `body` and `focus.matchesLastActivated` was false three times. The model declared no violations. The evidence was present and was misread.

## Conclusions for the build

- No session showed clipping, so page-ID navigation is not justified. Navigation stays URL-based through `legal.navigate`.
- The exploration failures are selection and completion failures, not visibility failures. The ledger therefore records, separately: discovered, model-visible, visited and probe-executed. A finish verdict is a claim; the ledger never takes coverage from it.
- Interpretation (menu-dialog) is a separate failure class and is scored separately from exploration.
- Fixture filenames and link text leak the answer (valid.html / broken.html, "Seite mit defektem Skip-Link"). Later fixture variants need neutral URLs and link text. The fixture server serves only `.html` and `malicious/*.js` from the loopback fixture origin, so `truth.json` is not reachable over HTTP. A test asserts the 404 through the contained browser.
- `exploratoryScript` in scripted-policy.ts is generic, with no fixture-specific routes.

## Regression

`test/adaptive-frontier.test.ts` reproduces the skip-links failure with a fake provider. The provider visits valid.html, then finishes "complete" with a summary claiming full coverage. The ledger must still show the following:
- broken.html discovered at step 0, model-visible and not visited, with its skip-link obligation pending;
- valid.html visited but not probed;
- zero executed obligations and remaining obligations > 0.
