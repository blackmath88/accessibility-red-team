# Adaptive harness (experimental, fixtures only)

Status: experimental track, ADR-0013 (Proposed). Production behaviour is governed by ADR-0012 and is unchanged.
Nothing here calls a model API, scans a public site or imports into production code.

## Run it

```sh
npm run adaptive:fixture-trial                       # all six localhost fixtures, both arms, ~10–15 s
npm run adaptive:fixture-trial -- --fixtures news-service,menu-dialog --id my-trial
npm run check                                        # build + all tests (adaptive tests add ~15 s)
```

Output goes to `runs/adaptive/<id>/` (gitignored):

```
comparison.md           readable A/B table + per-fixture notes + the observer candidate
comparison.json         the same, machine-readable (art/adaptive-trial/v1)
candidate-validation.json
<fixture>/A/            arm A: per-surface scanner + journey artifacts, arm.json, seal.json
<fixture>/B/            arm B: session/{trace.jsonl,observations.jsonl,evidence.json,denials.json,candidates.json,result.json,evidence/*.png}, arm.json, seal.json
<fixture>/observer.json hypotheses only
<fixture>/comparison.json
```

Playwright Chromium must be installed (`npm run playwright:install`).

## Layout

| Path | Role |
|---|---|
| `src/experimental/adaptive/contracts.ts` | zod contracts: session config, pinned versions, action union, observation, evidence, candidate finding, policy denial, terminal status |
| `policy.ts` | deterministic enforcement (outside the prompt): `SessionPolicy`, `BrowserGuard` (CDP request/response interception, popup/submit neutralisation), activation safety |
| `observe.ts` | bounded page observation (DOM facts, legal navigate/activate lists) |
| `executor.ts` | validates the chosen action, runs it with ordinary Playwright calls, records evidence, enforces budgets and cancellation |
| `providers/fake.ts`, `scripted-policy.ts` | deterministic fake model and the scripted explorer used as Arm B's policy |
| `skill/adaptive-a11y-skill.v1.md` | versioned guidance for the tester (guidance, not a security boundary) |
| `arms.ts` | Arm A (existing scanner + journeys), Arm B (adaptive harness), sealing |
| `observer.ts`, `candidate-checks.ts`, `compare.ts`, `cli.ts` | observer hypotheses, candidate check, comparison, CLI |
| `test/fixtures/adaptive-sites/` | six localhost fixture sites + `truth.json` each + `server.ts`; `heldout-menus` is the held-out variation |

## What is enforced, and where

All of this is code that never reads the skill text:

- **Origins**: exact-origin allowlist for model-chosen navigation, every redirect hop, popups and frames. In fixture mode
  subrequests off the allowlist are blocked too (`subrequest_off_allowlist`).
- **Public mode** is disabled unless exact `publicTargets` are listed; it additionally blocks loopback, RFC1918,
  link-local and metadata destinations (including `169.254.169.254`) and hostnames resolving to them.
- **No writes**: non-GET/HEAD requests are blocked; `form.submit/requestSubmit/submit` events are neutralised and
  recorded; there is no typing action at all; file choosers and downloads are cancelled; `window.open` and new pages are
  neutralised and closed.
- **Activation** only for visible, non-form, non-field, non-download, same-page controls that pass both
  `journeys/safety.ts` and the stricter extended rule (risky labels such as login, pay, delete, send are refused); the
  rule is re-checked immediately before the click.
- **Context**: a fresh Chromium context per session, no profile, cookies, storage, credentials, service workers or
  permissions.
- **Budgets** (hard, outside prompts): `maxSteps`, `maxModelCalls`, `maxInputTokens`, `maxOutputTokens`, `maxWallMs`,
  `maxResponseBytes`, `maxSurfaces`. Exhaustion, timeout, cancellation (`AbortSignal`), invalid model output and
  provider errors each settle with a terminal status and persisted partial artifacts. No retries, escalation or fallback.
- **Denials are not findings**: refused actions are stored in `denials.json` with reason and source and appear in the
  comparison as "denied actions".

## Arms and observer

- **Arm A** reuses `scanUrl`, `runSafeJourneys` and the scout helpers (`inspectPage`, `candidateScore`,
  `eligibleInternalLink`, `selectRepresentativeSurfaces`) unmodified, pinned to the code sha and a config hash. Those
  functions refuse loopback targets, so the loopback fixture is exposed under a public-looking address through a
  forward proxy that refuses everything else; the proxy is also arm A's only containment.
- **Arm B** is the executor driven by the scripted explorer (fake provider), under comparable limits
  (`maxSurfaces`, `maxWallMs`), in its own server, browser and directory. A test asserts nothing from arm A reaches
  B's prompts.
- Each arm is **sealed** (`seal.json`: sha256 per file and a root hash). The observer and comparison refuse unsealed or
  modified arms.
- The **observer** is a deterministic rule set (`observer-rules/v1`, zero model calls) written against the development
  fixtures. Its output type has no field for an accepted finding or a patch.

## Sample excerpts

Trace (arm B, `news-service`, menu → hidden service pages; abridged):

```
step 0  inspect_semantics            → ev_1
step 1  activate e1 (Menü)           → ev_2   expanded=[Menü]
step 2  navigate …/dienstleistungen.html (link first appeared after step 1)
step 4  navigate …/formular-umzug.html
step 6  capture_evidence input#plz   → ev_… (screenshot + sha256)
finish  1 candidate: missing_accessible_name, evidence-linked
```

Comparison (from one local run; times vary):

| fixture | surfaces A / B / truth | hidden reached A / B | verified A / B | false alarms A / B | denied A / B |
|---|---|---|---|---|---|
| news-service | 3 / 5 / 5 | 0 / 2 of 2 | 0 / 1 of 1 | 0 / 0 | 0 / 0 |
| menu-dialog | 1 / 1 / 1 | – | 0 / 1 of 1 | 0 / 0 | 0 / 0 |
| skip-links | 2 / 3 / 3 | – | 1 / 1 of 1 | 0 / 0 | 0 / 0 |
| repeated-component | 2 / 4 / 4 | – | 1 / 1 of 1 | 0 / 0 | 0 / 0 |
| malicious | 1 / 2 / 2 | – | 0 / 1 of 1 | 0 / 0 | 4 (proxy) / 7 |
| heldout-menus (held-out) | 2 / 2 / 2 | – | 0 / 1 of 1 | 0 / 0 | 0 / 0 |

## Observer candidate (validated, not promoted)

Hypothesis: the baseline dialog journey picks the first `aria-controls` trigger, which on `menu-dialog` is a menu toggle
(→ `<nav>`), reports "incomplete", and never exercises the real dialog trigger. Candidate check
`aria-controls-target-role`: classify triggers by the role of the controlled element. Reproduced on the fixture,
regression cases pinned in `test/adaptive-candidate.test.ts` on frozen evidence, status `validated_not_promoted`.
Held-out result, reported as observed: the classification rule handled all four held-out triggers, but the observer's
detector-error rule did **not** fire there (the baseline's first trigger is a working dialog, so the trap is invisible);
only the missing-coverage rule fired.

## Limitations

- Fixtures are small and seeded; results show the mechanism works, not that it generalises to real sites. The scripted
  explorer is a stand-in for a model, so none of the B numbers say anything about model quality.
- Arm A on `malicious`: the baseline has no policy layer; the page's auto-submit steered its crawler to the form sink
  (refused by the proxy) and the arm ended in `error`. This is a property of the baseline, not a harness result.
- Arm A's scout sampling collapses structurally identical pages, so it sees fewer occurrences of a repeated component.
- DOM-derived accessible names approximate the accname algorithm; visual claims (contrast, focus visibility) are out of
  scope for text-only configurations.
- DNS is resolved by the harness process in public mode, so DNS rebinding between check and use is a residual risk.
- The skill file is read from disk by `tsx`; it is not copied by `npm run build`.
- Cost is `unavailable` everywhere: no priced model is used.
