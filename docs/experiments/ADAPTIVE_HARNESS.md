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
| `skill/adaptive-a11y-skill.v3.md` (v1 and v2 kept as trial provenance) | versioned guidance for the tester (guidance, not a security boundary) |
| `arms.ts` | Arm A (existing scanner + journeys), Arm B (adaptive harness), sealing |
| `observer.ts`, `candidate-checks.ts`, `compare.ts`, `cli.ts` | observer hypotheses, candidate check, comparison, CLI |
| `test/fixtures/adaptive-sites/` | six localhost fixture sites + `truth.json` each + `server.ts`; `heldout-menus` is the held-out variation |

## What is enforced, and where

All of this is code that never reads the skill text:

- **Origins**: exact-origin allowlist for model-chosen navigation, every redirect hop, popups and frames. In fixture mode
  subrequests off the allowlist are blocked too (`subrequest_off_allowlist`).
- **Public mode is disabled at runtime**: `runSession` throws before starting a browser. The config schema and the
  destination decision functions remain (and are unit-tested): exact `publicTargets` are required and loopback, RFC1918,
  link-local and metadata destinations (including `169.254.169.254`), IPv4-mapped / NAT64 / 6to4 literals embedding such
  addresses (`isPublicAddress`, stricter than `src/scope.ts`) and hostnames resolving to them are refused. It stays off until
  DNS is pinned for the browser (cache expiry, host mappings, site isolation) and the owner approves it.
- **Network boundary**: every request from the sandbox browser goes through a deny-by-default loopback proxy
  (`containment.ts`; GET/HEAD to the allowed fixture origin only; CONNECT and upgrades refused). Arm B and the tests run behind
  it, and `runSession` launches one when no browser is supplied. It is the layer that stops a dedicated worker's WebSocket,
  which no page-level control sees; proxy refusals appear in arm B's denials as `containment_proxy` (records capped at 200, the
  remainder counted). Response headers lose hop-by-hop, proxy and `Set-Cookie` headers; a truncated upstream body ends the
  client response. Non-proxied WebRTC UDP is disabled at launch, and `runSession`/`runArmB` refuse an uncontained browser.
- **Channels page interception cannot see**: WebSockets from pages and frames are refused (`websocket` denial, never
  connected; `routeWebSocket` is a per-page mock and does not reach workers, the proxy does), SharedWorker is
  removed from the sandbox browser (`--disable-blink-features=SharedWorker`; an init-script stub is a second layer and records
  `worker_blocked`), service workers are blocked on the context. A browser-level CDP auto-attach to worker targets was tried
  first and cannot be driven through Playwright's `CDPSession`, so the feature is removed instead of filtered.
- **Page-writable channel**: `window.__artPolicy` is callable by any page. Only a closed set of kinds is read, the recorded
  detail is fixed harness text, browser-policy denial records are capped at 200 per session (overflow only counted), and the
  model sees a harness-authored line for them instead of the stored detail.
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
step 0   inspect_semantics                     → ev_1
step 1   activate e1 (Menü)                    → ev_2   state: expanded=[Menü]; "Dienstleistungen" link now exists
step 2   navigate …/2026-03-12-strassensperrung.html     (all links match the scripted "service-first" regex via the
step 4   navigate …/2026-02-27-wahlen.html                 "news-service" path, so the order is link order)
step 6   navigate …/dienstleistungen.html      → ev_7
step 8   navigate …/formular-umzug.html        → ev_9
step 10  capture_evidence input#plz            → ev_11 (screenshot + sha256)
step 11  finish: 5 surfaces, 1 candidate (missing_accessible_name) citing ev_11
```

Historical comparison (one preserved local run at commit `23d4b22103d6c163fa0e9cda569995acc17d1fbb`,
arm A config hash `ea4e65f4aa709d4b5ccee1fc849b8d72593a9dc5ae5882ab833695a96c2a5728`; times vary):

| fixture | surfaces A / B / truth | hidden reached A / B | verified A / B | false alarms A / B | denied A / B |
|---|---|---|---|---|---|
| news-service | 3 / 5 / 5 | 0 / 2 of 2 | 0 / 1 of 1 | 0 / 0 | 0 / 0 |
| menu-dialog | 1 / 1 / 1 | – | 0 / 1 of 1 | 0 / 0 | 0 / 0 |
| skip-links | 2 / 3 / 3 | – | 1 / 1 of 1 | 0 / 0 | 0 / 0 |
| repeated-component | 2 / 4 / 4 | – | 1 / 1 of 1 | 0 / 0 | 0 / 0 |
| malicious | 1 / 2 / 2 (A ended `error`: not comparable) | – | 0 / 1 of 1 | 0 / 0 | 4 (proxy) / 7 |
| heldout-menus (held-out) | 2 / 2 / 2 | – | 0 / 1 of 1 | 0 / 0 | 0 / 0 |

Corrected-baseline evidence is recorded separately. At commit
`dba31b68671a11cbf685edd4c11502edb7c923be`, using the same arm A config hash, three malicious-only
trials at fixture concurrency 1 and three full six-fixture trials at concurrency 3 all produced the same malicious
comparison: both arms `completed`, 2 / 2 / 2 surfaces, 1 / 1 verified defect, `comparable: true`, and
`reachedStateBaselineMissed: false`. Arm A proxy refusals were 28 in every run (observed range 28–28); both arms
recorded zero off-origin and zero non-GET requests reaching a server. These six repetitions are a range across runs,
not a value from the historical single-run table. A separate single full-suite run at the same commit completed normally
without forced exit: 242 / 242 tests passed in 18.9 s. This correction changes deterministic baseline behaviour only;
arm B remains the scripted fake-provider explorer, so it is not evidence of model capability.

## Observer candidate (validated, not promoted)

Hypothesis: the baseline dialog journey picks the first `aria-controls` trigger, which on `menu-dialog` is a menu toggle
(→ `<nav>`), reports "incomplete", and never exercises the real dialog trigger. Candidate check
`aria-controls-target-role`: classify triggers by the role of the controlled element. Reproduced on the fixture,
regression cases pinned in `test/adaptive-candidate.test.ts` on frozen evidence, status `validated_not_promoted`.
Held-out result, reported as observed: the classification rule handled all four held-out triggers, but the observer's
detector-error rule did **not** fire there (A's dialog journey returned `incomplete` with a different evidence shape; the
cause was not investigated, the expandable journey runs first and may have left a dialog open); only the missing-coverage
rule fired. The held-out fixture is only *partly* held out: its authors ran both arms on it in debug scripts before the
observer existed and added its `controls` truth map afterwards. No rule or check was tuned to it, but it was seen.

## Limitations

- Fixtures are small and seeded; results show the mechanism works, not that it generalises to real sites. The scripted
  explorer is a stand-in for a model, so none of the B numbers say anything about model quality.
- Arm A on `malicious`: the baseline has no policy layer of its own; the proxy refuses the page's off-origin and non-GET
  traffic. Its discovery step aborts any top-level navigation a page starts itself, so the page's auto-submit can no longer
  replace the page being discovered. Before that, whether the submit landed inside discovery's 150 ms settle wait depended
  on machine load: the arm either crawled the form sink and ended in `error`, or completed.
- Arm A's scout sampling collapses structurally identical pages, so it sees fewer occurrences of a repeated component.
- DOM-derived accessible names approximate the accname algorithm; visual claims (contrast, focus visibility) are out of
  scope for text-only configurations.
- Public mode cannot run (see above). Its known gaps: DNS is resolved by the harness process and cached without expiry, the
  browser resolves independently, no host mappings are supplied and site isolation is disabled.
- `observePage` and `classifyActivation` execute in the page's main world, so a hostile page can spoof what they read. The
  network layer is the boundary, not these classifiers.
- Reading the comparison: arm A's `offOriginRequests` is 0 by construction (its proxy refusals are the real signal), and A's
  `incomplete` dialog journeys go to `needsReview`, which is not credited, so "B verified, A missed" is partly a scoring
  artifact.
- The skill file is read from disk by `tsx`; it is not copied by `npm run build`.
- Cost is `unavailable` everywhere: no priced model is used.
