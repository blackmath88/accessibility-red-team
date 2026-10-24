# Zürich five-site pilot: results review

Date: 2026-10-24 · Base: `main` @ `088b0f8` · Scope: read-only review of frozen evidence. No scans, crawls, journeys or model calls were run for this review.

This review reads the underlying probe and journey files, not Theatre events or summary counts. Labels: **OBSERVED** means read from a cited file or recomputed from its nodes. **HYPOTHESIS** means an inference the evidence does not establish. **UNAVAILABLE** means the evidence needed does not exist in any frozen artifact.

## Evidence used

| Id | What | Durable reference | Integrity |
|---|---|---|---|
| E1 | Passive cohort run, 19 surfaces | GitHub Actions run [36230165655](https://github.com/blackmath88/accessibility-red-team/actions/runs/36230165655), artifact `zh-small-pilot` (id 10902213303), sha `4fd7d83`, 2026-09-26 | Not hashed. **Artifact expires 2026-12-25.** |
| E2 | Journey cohort run, 10 surfaces | Run [36233756867](https://github.com/blackmath88/accessibility-red-team/actions/runs/36233756867), artifact `zh-small-pilot-journeys-once` (id 10903263307), sha `b2c02ca` | Not hashed. **Expires 2026-12-25.** |
| E3 | Frozen deterministic pilot (Volken, Maschwanden, plus Basel sites for comparison) | `deterministic-pilot-20260929T100045Z`, repo sha `7ea6f41`, workstation copy | `sha256sum -c artifact-manifest.sha256`: 106/106 OK |
| T | Theatre re-recording | `theatre/runs/zh-small-pilot-2026-10-09.summary.json` | Summary only. Raw evidence is UNAVAILABLE. |

The earlier `zh-small-pilot` artifacts from runs 36229897372 and 36229582107 were not analysed.

Pointers below have the form `<site>/surfaces/surface_NN/<file>#<JSON pointer>` relative to E1 unless another run is named. Surface numbering differs between runs.

## 1. Coverage

| Site | Audited surfaces (E1) | Journeys (E2) | Missing coverage (OBSERVED) |
|---|---|---|---|
| Volken | `/`, `/dienstleistungen`, `/online-schalter`, `/abfallarten` | `/`, `/dienstleistungen` | `/aemter` was listed but not sampled. No e-service was reached. |
| Maschwanden | `/de/index.php`, `/de/verwaltung/lebenslagen/`, `…?kat_id=2` | home, `/lebenslagen/` | The online counter (`/de/verwaltung/onlineschalter.php`) was never visited. Both "form" surfaces are list/filter pages (HYPOTHESIS). |
| Truttikon | `/`, `/dienstleistungen`, `/online-schalter`, `/abfallarten` | `/`, `/dienstleistungen` | `/abfalldaten` was not sampled. No forms or PDFs were in the sample. |
| Ossingen | `/`, `/verwaltung/kontakte`, `…/onlineschalter/handlungsfaehigkeitszeugnis`, `/verwaltung/onlineschalter` | `/`, `/verwaltung/kontakte` | The only real multi-field form got static axe only. `/verwaltung/reservation` was not sampled. |
| Bachs | `/` plus **three dated news posts** | home, one news post | **No real service page or form was sampled.** `/onlineschalter` was listed in E2 but never audited. |

These gaps apply to every site (OBSERVED):

- Journeys ran only on surfaces 01 and 02. No form was submitted and no external handoff was followed, as the `safety` flags in every journey result show. WCAG 3.3.x error handling is therefore untested.
- PDF content is not probed. The audited surfaces link to PDFs: 6 on Bachs, 6 on Maschwanden and 13 on Ossingen.
- `target-size` is disabled (`coverage.json`), so WCAG 2.5.8 is not tested.
- The audit samples 4 of the 8 discovered pages per site. The other pages are not recorded (UNAVAILABLE).

The archetype classifier, which drives sampling, mislabels pages (OBSERVED, `src/scout/classify.ts:5`). `FORM_TERMS` includes `gesuch`, and it is matched as a substring, so it hits "**gesuch**t" ("wanted"). Two Bachs news posts became `form` for that reason. Separately, `SERVICE_TERMS` includes `gemeinde`, which appears in nearly every page title.

## 2. Concrete barriers (representative, OBSERVED)

| Site | Rule · outcome | Evidence |
|---|---|---|
| Volken | `image-redundant-alt` · violation, on 4 of 4 surfaces | `<img … alt="Volken Gemeinde">` logo · `ch-zh-volken/surfaces/surface_01/probe-results.json#/0/nodes/0` |
| Volken | `skip-link.same-page` · journey violation | "Direkt zum Inhalt" → `#maincontent`, `targetExists:false` · E2 `ch-zh-volken/surfaces/surface_01/journey-results.json#/results/1/evidence/0`. **Not corroborated:** axe `bypass` passes and `skip-link` is inapplicable. |
| Maschwanden | `color-contrast` · violation | `systematische rechtssammlung`, 2.29:1 (#a0a0a0 on #f0f0f0) · `ch-zh-maschwanden/surfaces/surface_01/probe-results.json#/0/nodes/0` |
| Maschwanden | `link-name` · violation, 10 nodes | Empty Instagram-embed links `<a target="_blank" rel="noopener" href="https://instagram.com/…">` · `…/surface_01/probe-results.json#/3/nodes/0` |
| Maschwanden | `label` · violation | Table filter `<input class="formwork_Textfilter" … name="search">` with no label · `…/surface_02/probe-results.json#/2/nodes/0` |
| Truttikon | `landmark-one-main` · violation, on 4 of 4 | `<html lang="de-CH">`, no main landmark · `ch-zh-truttikon/surfaces/surface_01/probe-results.json#/2/nodes/0` |
| Truttikon | `accesskeys` · violation, 19 nodes | Duplicate `accesskey` on the skip-link list · `…/surface_01/probe-results.json#/0/nodes/0` |
| Truttikon | `skip-link.same-page` · journey violation on `/` | `#maincontent` is missing on the home page but present on sub-pages (`<div id="maincontent">` at `…/surface_02/probe-results.json#/45/nodes/82`, and on no surface_01 node). This is corroborated as a page-level template difference. |
| Ossingen | `meta-viewport` · violation, on 4 of 4 | `user-scalable=no, maximum-scale=1` · `ch-zh-ossingen/surfaces/surface_01/probe-results.json#/8/nodes/0` |
| Ossingen | `image-alt` · violation, 16 nodes | Online-counter icons without alt text, each inside `a[title="Online"]` · `…/surface_04/probe-results.json#/2/nodes/0` |
| Ossingen | `color-contrast` · violation | Form submit button "Schicken", 1.88:1 (#ffffff on #c9bba3) · `…/surface_03/probe-results.json#/1/nodes/0` |
| Bachs | `link-name` · violation, 36 nodes | Icon-only header menu links `<a href="#" class="awb-menu__main-a …">` · `ch-zh-bachs/surfaces/surface_01/probe-results.json#/1/nodes/0` |
| Bachs | `page-has-heading-one` · violation | No `h1` on either news-post page · `…/surface_02/probe-results.json#/3/nodes/0` |

## 3. Repetition and shared causes

`triage.ts` groups findings by `probeId:outcome` only. The pilot doc's "repeated across surfaces" column therefore means the same *rule* fired on more than one surface, not that the same markup did. Grouping by identical `(rule, outcome, target, html)` gives:

| Site | Failing nodes | Distinct signatures | Signatures on more than one surface |
|---|---:|---:|---:|
| Volken | 30 | 11 | 7 |
| Truttikon | 118 | 72 | 21 |
| Maschwanden | 120 | 98 | 16 |
| Bachs | 82 | 52 | 14 |
| Ossingen | 295 | 251 | 16 |

Shared-cause evidence:

- **Across sites (OBSERVED):** Volken and Truttikon serve byte-identical markup for the skip-link list (`icms-a4a-sprunglinks`), the consent widget (`.optin-stats`) and the `/_rte/` URL scheme. Both sites also miss `#maincontent` on the home page. The `icms-` prefix appears on no other site. That both run the same vendor CMS ("i-web") is a HYPOTHESIS. The template does not explain everything: Truttikon lacks `<main>`, while Volken has one.
- **Design tokens (OBSERVED pairs, HYPOTHESIS cause):** Maschwanden's 25 contrast violations reduce to 3 colour pairs. Ossingen's 19 reduce to 3 pairs, all involving the brand colour #c9bba3.
- **Site templates (OBSERVED):** Ossingen's `<header>` structure produces 4 landmark rules on every page. Bachs' icon-only menu (Avada/Fusion markup) appears on every page.
- **Other CMS families (OBSERVED markup, HYPOTHESIS vendor):** Ossingen uses TYPO3-style `powermail` and `fileadmin` markup, Bachs uses Avada for WordPress, and Maschwanden's CMS is unidentified. No identical signature is shared across these three.
- **Static axe is stable (OBSERVED):** per-probe node counts for surfaces 01 and 02 are identical in E1, E2 and E3 across 3 shas and 3 days.

## 4. Incomplete, noisy, or needing human judgment

There are 181 axe `incomplete` nodes in E1. 177 of them are `color-contrast`, and every reason is a rendering property:

| Reason (axe message) | Nodes |
|---|---:|
| background overlapped by another element | 55 |
| background gradient | 51 |
| background image | 26 |
| complex text shadows | 24 |
| pseudo element | 18 |
| partially overlaps other elements | 3 |

The rest are `aria-valid-attr-value` (3 nodes, Maschwanden, `controlsWithinPopup`) and `video-caption` (1 node, Ossingen's muted header video). Most of Maschwanden's gradient and overlap cases are its Instagram embed (OBSERVED for the sampled nodes).

Of the 40 E2 journey results, 18 are incomplete and 14 are inapplicable:

- **`dialog.focus-behavior` incomplete, 5 results:** every "dialog trigger" actually controls a navigation container (`aria-controls` = `navigationMainList`, `sidebar__nav`, `menu-hauptmenu`). This is a detector misclassification.
- **`keyboard.focus-trace` incomplete, 5 results:** the heuristic checks only outline and box-shadow. Indicators made from background or colour changes need pixels to judge.
- **`skip-link.same-page` incomplete, 3 results on 2 sites:** "bypass semantics need review". Bachs' target is a `<section>` with no `tabindex`, so a structural or behavioural check could decide it.
- **Unstable verdict (OBSERVED):** Volken `keyboard.focus-trace` is `pass` in E2 but `incomplete` in E3, with the same focus evidence. The verdict logic probably changed between `b2c02ca` and `7ea6f41` (HYPOTHESIS).

These still need human judgment: whether third-party embed contrast is in scope, whether non-outline focus indicators are adequate, and whether repeated icon links titled "Online" are acceptable.

## 5. What deterministic code resolves, and the census

The ambiguity census (`npm run evaluation:ambiguity-census`) was run over E1, E2 and E3. Raw, it reports `unclassified = 1.0` and `sites = 1` for E1 and E2. **This is a census defect (OBSERVED in `src/evaluation/ambiguity-census.ts`) with two causes:**

1. `siteOf()` only recognises a `sites/` path segment. Cohort runs use `<site>/surfaces/…`, so all five sites collapse into one, and the `minSites: 3` gate cannot be met.
2. `AXE_INCOMPLETE_MODALITY` is keyed by bare rule ids (`color-contrast`), but observatory probe ids carry an `axe.` prefix. Every observatory rule therefore falls into `unclassified`, and the gate cannot open on observatory evidence as shipped.

Normalising both inputs (adding the `sites/` segment and stripping `axe.`) and calling the unchanged `buildCensus()` gives:

| | E1 | E2 | E3, 5 sites | E3, ZH only |
|---|---:|---:|---:|---:|
| unresolved axe nodes | 181 | 145 | 129 | 65 |
| `visual_rendering` | 97.8% | 97.9% | 98.4% | 96.9% |
| `text_semantic` | **0** | **0** | **0** | **0** |
| `frequencyGateMet` | false | false | false | false |

**Conclusion: the unresolved burden is a pixel problem, not a text problem.** On this evidence, the ADR-0012 re-entry gate for a text model is not met.

Candidate uncertainties, with a verdict for each:

| Candidate | Frequency | Verdict |
|---|---|---|
| Dialog vs menu trigger | 5 of 5 dialog incompletes, 3 sites | Deterministic: if `aria-controls` targets a nav or list, or `aria-haspopup=menu`, classify as menu. |
| Skip-link bypass semantics | 3 results, 2 sites | Deterministic: check whether the target is focusable and whether focus actually moves. |
| Page archetype for sampling | Bachs 3 of 3 non-home pages mislabeled; Maschwanden 2 of 2 likely | Mostly deterministic (a word-boundary regex plus a `/YYYY/MM/slug` news rule). It is the only class decidable from text alone, and the only one tied to a coverage loss. |
| `color-contrast` incomplete | 177 of 181 nodes | Needs pixels, so it is not a text-model task. |

## 6. Count reconciliation

`docs/ZH_SMALL_PILOT.md` matches E1 exactly, recomputed from nodes. Theatre (2026-10-09) is a separate later scan and differs slightly:

| | E1 | Theatre |
|---|---:|---:|
| color-contrast incomplete | 177 | 182 |
| region | 237 | 235 |
| landmark-unique | 12 | 13 |
| page-has-heading-one sites | 3 | 2 |
| th-has-data-cells incomplete | 0 | 1 |

The differences cannot be verified because Theatre's raw evidence is UNAVAILABLE. Do not cite Theatre counts as the pilot's numbers.

`docs/MORROW_EXECUTION_ARCHITECTURE.md` §2 counts "32 of 40 unresolved". Only the 18 incomplete results are unresolved. Inapplicable is a different state, and some inapplicable results are detector misses (Ossingen's overlay navigation).

## Unavailable evidence

- Full page DOM and CSS: snapshots store `htmlBytes` and a screenshot, not HTML.
- PDF content, and post-click or post-submit states.
- Theatre raw evidence.
- The 3–5 discovered-but-unlisted pages per site.
- A hash manifest for E1 and E2.
- Human ground-truth labels of any kind.
