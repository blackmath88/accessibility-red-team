# Zürich small municipality pilot — 2026-09-26

## Cohort

- Volken
- Maschwanden
- Truttikon
- Ossingen
- Bachs

The cohort is deliberately a **research benchmark**, not a legal compliance ranking. The selected profile uses WCAG 2.2 AA for technical benchmarking while municipal binding applicability remains unestablished in the provenance model.

## Result

All five sites completed successfully with zero AI calls.

| Municipality | surfaces scanned | grouped findings | repeated across surfaces | needs review |
|---|---:|---:|---:|---:|
| Volken | 4 | 5 | 4 | 1 |
| Maschwanden | 3 | 8 | 7 | 2 |
| Truttikon | 4 | 7 | 6 | 1 |
| Ossingen | 4 | 16 | 12 | 2 |
| Bachs | 4 | 6 | 6 | 1 |

## Shared finding families

The first cross-site patterns are:

1. `axe.region` — deterministic violation in 4/5 municipalities, 237 occurrences.
2. `axe.link-name` — deterministic violation in 4/5, 55 occurrences.
3. `axe.heading-order` — deterministic violation in 4/5, 15 occurrences.
4. `axe.landmark-unique` — deterministic violation in 4/5, 12 occurrences.
5. `axe.page-has-heading-one` — deterministic violation in 3/5.
6. `axe.color-contrast` — **incomplete / needs review** in all 5 municipalities (177 occurrences); do not report these as confirmed violations.
7. Confirmed `axe.color-contrast` violations occurred in 2/5 municipalities (44 occurrences).

This is already a useful product signal: shared structural/template problems are more important than raw page-level alert counts.

## Engineering observations

- Limiting the audit to at most four representative surfaces per municipality retained the major issue families.
- One Chromium instance is reused per site audit.
- Network/render work still dominates cohort runtime; browser reuse alone does not materially collapse total runtime.
- Cross-site aggregation must preserve `outcome`; otherwise `incomplete` and `violation` results can be misleadingly merged.
- Municipality reports correctly show zero legally “applicable” findings under the research profile. This is intentional until municipality-level applicability is sourced.

## Next build step

Add **safe browser journeys** for behavior that static DOM/axe inspection cannot establish:

- keyboard tab/focus visibility;
- skip links;
- menu expansion;
- dialogs and focus containment;
- accordions;
- zoom/text resize.

These should remain bounded, non-submitting, deterministic probes.
