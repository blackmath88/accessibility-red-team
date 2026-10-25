# Frontier benchmark: design notes

Status: harness, scheduler, scoring and a dry-run benchmark config are built. Results come in three kinds, which are never mixed:
- **Historical live trials 1–3** with a real model (ADAPTIVE_MISTRAL.md). They are not re-run, re-scored or retrofitted.
- **New local runs** with scripted stand-ins and the scheduler. They use no model and run on development fixtures only.
- **Pending API comparisons** (A, B, C with real models). Not run; they need owner approval.

## Conditions

Each run takes an `ExplorationCondition` (`art/adaptive-condition/v1`) on the run options; it is not part of `SessionConfig`, so `configHash` does not change. `result.json` records the condition and the skill version actually loaded (`pinned.skillVersion`, `pinned.skillSha256`).

| Flag | Off (condition A) | On |
|---|---|---|
| `ledgerVisible` | observation has no `frontier` key | bounded `frontier` field plus `frontier-shown.jsonl` |
| `completionAccounting` | `result.completion` is `null` | controller classifies completion from the ledger |
| `incrementalCandidates` | `report_candidate` is refused as an unknown type | `report_candidate` is legal; duplicates are recorded as such, but only when every cited evidence record has a target (findings citing untargeted evidence are never collapsed) |
| `selector` | `model` | `scheduler`: the deterministic scheduler drives the session (condition D); needs `ledgerVisible`, `incrementalCandidates` and the scheduler provider |

- **Condition A** has all flags off. It loads skill v3 and sends the same prompts as trial 3. Its only artifact differences are `frontier.json` and the `condition` / `completion: null` fields in `result.json`.
- **Ledger-hidden control:** `completionAccounting` and `incrementalCandidates` on, `ledgerVisible` off. It loads skill v4.
  - With `ledgerVisible` off, nothing is added to the observation. For the same well-formed actions, its observations equal condition A's apart from the timestamp and the remaining wall-clock budget, and a test enforces this.
  - `incrementalCandidates` changes two things the model can see: the allowed-types list in a refusal hint (shown through `recentDenials` after a malformed action), and the history entry of a `report_candidate`, which is accepted here but refused under A.
  - B and the control share both, so a difference between B and the control is due to visibility. A difference between A and the control is due to the shared repairs.
- **B:** all three flags on, same model as A.
- **C:** the same as B, with a stronger pinned model.
- **D:** the deterministic scheduler with all three flags on. It differs from B only in the selector and in using the rule table for interpretation. It sees the same information as B's model: it picks pages only from that turn's compact view (with `discoveredOn` as its sampling source) and keeps no memory of pages the view no longer shows.

A mislabelled run is refused:
- `selector: "scheduler"` with any other provider;
- the scheduler provider under `selector: "model"`;
- the scheduler without `ledgerVisible` or `incrementalCandidates`.

Arm B's `configHash` includes the condition whenever it is not condition A, so historical arm B hashes are unchanged.

`report_candidate` is deliberately not added to `legal.simple`. Simple actions are not enforced from that list, and adding it would make the ledger-hidden control's observations differ from A's. It is documented in skill v4 instead, identically for B and the control.

## Ledger and provenance

`frontier.json` (`art/adaptive-frontier/v1`) is written after every turn and on every terminal path, whatever the condition.
- An obligation becomes executed only through an evidence record of a probing action on that page. Navigation is not a probe, visited is not tested, and tested is not passed.
- Policy denials of a navigation to a known page mark that page's obligations as blocked. A URL the model invents never becomes a page.

## Compact view (ledgerVisible)

The compact view lists, within its bounds, the current page, discovered pages not yet visited (while surfaces remain and the page is in the sampling scope), pages legal this turn and visited pages. Unvisited pages are included because their URLs were shown to the model when they were discovered, and the executor accepts any discovered URL. Each page carries `discoveredOn` (the id of the page its link was first seen on). Outstanding obligations are listed for every shown page, so a model on a sibling page still sees the unvisited siblings' pending work. A page shown in the compact view counts as model-visible.

## Completion accounting

A finish verdict is stored as `completion.proposal`. The controller decides `completion.outcome`:
- `cancelled`: the caller aborted the run.
- `exhausted`: `budget_exhausted` or `timeout` ended the session, or the surface cap kept work out of reach (a `surface_limit` refusal, or a page never offered once no surfaces were left, counted as `surfaceCapped`). The surface cap is a budget, so attempting the page and not attempting it get the same label.
- `partial`: relevant reachable obligations are still pending, or the ledger hit a bound, or the session ended with an error.
- `blocked`: nothing relevant is pending, but at least one obligation was blocked by a policy other than the surface cap.
- `complete_within_scope`: none of the above, and the session ended normally.

**Relevant reachable** means:
- the obligation is pending, whatever its applicability (an unvisited page's skip-link check is `unknown` and still counts);
- its page was visited, listed in `legal.navigate`, or shown in the compact view;
- its page is within the declared sampling scope.

**Sampling rule** (`condition.sampling.maxPagesPerSource`, default 6, minimum 2): per discovery source (the page a link was first seen on), only the first N pages in discovery order count. Pages are never chosen by URL or link text. Pages past N, unreachable pages, deferred obligations and blocked obligations are listed in `completion.exclusions` with reasons. Both lists are bounded and report truncation counts.

Accounting does not force exploration: hard caps on steps, calls, tokens, wall time and surfaces are unchanged, and the session still ends when the model finishes.

## Model-visible omissions

- `frontier.json` lists turns where `legal.navigate` showed fewer pages than the navigable links (`modelVisibleClipping`).
- With `ledgerVisible`, `frontier-shown.jsonl` records for every turn what the compact view showed, what its bounds clipped, and which discovered pages it did not show (unvisited, and either no surfaces left or outside the sampling scope).

## Deterministic scheduler (`frontier-scheduler/v1`, scheduler.ts)

The scheduler is a `ModelProvider` that makes no model call: usage is 0, the cost is 0, and its model id is `frontier-scheduler/v1`. Its actions therefore pass through the same validation, execution, containment, budgets and denials as a model's. It reads only the observation it is sent, plus its own state. The frozen ordering:

1. **Pages** breadth-first in discovery order, by page id compared numerically. The current page is finished before moving on. The URL of a page seen earlier is remembered, because the executor accepts any URL discovered in the session.
2. **Probes within a page** in a fixed order:
   - `inspect_semantics`, which records names and skip links;
   - disclosures and menus (activate);
   - dialogs: activate, check focus moved in, Escape, check focus returned.

   Ties are broken by obligation id, which follows discovery and element order.
3. **Caps:** `condition.sampling.maxPagesPerSource`, and the executor's surface, step, call and wall caps, unchanged.

It never reads fixture truth, and never uses file names, URLs or text as signals. Two tests enforce this: a static scan of the source, and a permutation test with the URL names swapped. Its finish proposal is `"complete"` only when nothing in its view is outstanding; otherwise it is `"inconclusive"`.

## Rule table (`frontier-rules/v1`, frontier-rules.ts)

This is a separate, versioned interpretation mechanism. It is not a model, and it is scored apart from exploration. Whether such a table belongs in the product is an **open design decision for the owner**. The rules, in a frozen order:

| Rule | Fires when | Category |
|---|---|---|
| R1 | a visible control or link has no accessible name (after `inspect_semantics`) | `missing_accessible_name` |
| R2 | a skip link's target is missing or is not the main landmark | `skip_link_broken` |
| R3 | after activating a dialog trigger, a dialog is visible but contains no focus | `focus_not_moved_to_dialog` |
| R4 | after Escape, focus is not on the trigger (`focus.matchesLastActivated` false) | `dialog_focus_not_returned` |

The rules are capped at 6 findings per page. Each finding is captured on its element with `capture_evidence`, then sent with `report_candidate`. It cites the probe's evidence and the capture, and its `limitations` names the rule table.

## Scoring funnel (`frontier-funnel/v1`, funnel.ts, evaluator only)

Each seeded defect instance is scored separately:
- **Exploration:** discovered, model-visible, selected (a navigation to the page that the executor carried out; refused attempts do not count), visited, relevant probe executed (taken from the ledger).
  - "Probe executed" for a skip link means the static target facts (`targetExists`, `targetIsMain`) were recorded by `inspect_semantics` or `capture_evidence`, the same facts every condition sees. It does not mean the skip link was followed. Dialog obligations match the defect's control exactly.
- **Interpretation:** interpreted (a candidate of the right category on the page), then evidence-backed reported (an accepted candidate matched by compare.ts's rule: category, path and locator). When cited evidence targets a skip link, its href, taken from that evidence's own skip-link facts, joins the locator, so credit does not depend on the note's wording.

The funnel reads the condition and sampling from the run's `result.json` and refuses a caller label whose expected condition disagrees.

**Credited** requires both the probe and the report. A start page counts as visible and selected.

Also scored per session:
- premature completion: proposal `complete` while `classifyCompletion` says otherwise (the same pure function the controller uses). D proposes `complete` only when no obligation is pending anywhere in the ledger, so its premature-completion rate is about 0 by construction. Compare that rate across model conditions, not against D;
- page, state and probe coverage;
- duplicates;
- denied actions by reason.

Accepted findings that match no seeded defect are **unadjudicated**: neither verified nor false positives. They need blinded adjudication.

**Comparability rule:** sessions that end `completed`, `budget_exhausted` or `timeout` (all budget ends) are comparable. Sessions that end in `error`, `provider_error`, `invalid_model_output`, `denial_limit` or `cancelled`, and every run on the malicious fixture, are not comparable. The comparison reports the number of non-comparable sessions per condition next to recall, so a condition that fails more often cannot look better on a comparable subset unnoticed.

There is no credit for a visit without its probe, for self-reported coverage, or for duplicates. Ground truth is read only by the evaluator, after a session.

## Fixtures

Development fixtures (`test/fixtures/adaptive-sites/variants.ts`), all labelled **development**:
- `skip-links`, `news-service`, `menu-dialog` (existing). These are **leaky**: their URLs and link text reveal the defect (for example a link named after the broken skip link). Models can read that; the scheduler does not. They are listed as `leakyFixtures` in the benchmark config, flagged `[LEAKY]` in the plan, and given their own subtotal in the comparison, separate from the neutral variants;
- `dev-k1`: the trial-3 sibling pattern with neutral names. Four siblings; the broken skip link is the third in discovery order.
- `dev-k2`: a different structure, a nav with two siblings. An unnamed icon button is on the first, a skip link whose target exists but is not main on the second. A named button is a control.
- `dev-k3`: one page with a disclosure and two dialog triggers built from the same template. The first returns focus; the second drops it.

Paths, titles and link text are neutral, and defect positions are hand-permuted. `truth.json` is never served; a test checks for the 404.

The held-out generator is a stub that refuses unless the owner supplies a seed and the frozen code sha after code freeze. **No held-out case has been generated or inspected.** `heldout-menus` is excluded, because it was seen during development.

## Local comparison (no API)

`npm run adaptive:frontier-local` runs A-standin, hidden-standin, B-standin and D over the development fixtures. Each session gets its own directory with `frontier.json`; the run also writes `funnel.json` and `comparison.md` under `runs/frontier-local/<id>/`, which is gitignored.

The stand-ins all use the scripted explorer. It does not read the frontier and picks some links by text, so differences among them reflect harness accounting only. They say nothing about model behaviour.

## Live benchmark (dry run only; pending owner approval)

`npm run adaptive:frontier-benchmark` reads `src/experimental/adaptive/trials/frontier-benchmark.v1.json`: conditions A, hidden, B, C, D over fixtures × repeats (shipped as 6 development fixtures × 5 repeats × 5 conditions = 150 sessions). The ledger-hidden control is included so that A→B gains can be split into the shared repairs (A→hidden) and visibility (hidden→B). It prints the plan, reads no environment variable, makes no network call, and has no live path (`--live` is refused).

Each condition id is bound to its flags, selector and model slot:
- A: all flags off, baseline;
- hidden: ledger off, accounting and `report_candidate` on, baseline;
- B: all on, baseline;
- C: all on, stronger;
- D: all on, scheduler, no model.

Ids must be unique, the stronger model must differ from the baseline, and every leaky fixture must be declared. A mislabelled plan gets no confirm hash.

It refuses to produce a confirm hash while any of these remain:
- condition C's model id (`OWNER_SUPPLIED_PINNED_MODEL_ID`; dated ids only, no `-latest`);
- C's prices;
- the total budget.

Pending owner decisions:
- C's exact model and prices, and the total budget;
- approval of any live run, and a live runner for it, which does not exist yet;
- the held-out seed after code freeze;
- whether the rule table is an acceptable mechanism.
