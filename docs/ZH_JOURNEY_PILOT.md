# Zürich safe-journey pilot — 2026-09-26

## Purpose

Field-validate the first bounded behavioral probes without expanding geography.

Same five municipalities as the passive pilot, at most two representative surfaces per site.

## Behavioral result

| Journey | Outcome | Municipalities | Results |
|---|---|---:|---:|
| dialog.focus-behavior | incomplete | 3 | 5 |
| dialog.focus-behavior | inapplicable | 3 | 5 |
| expandable.aria-expanded | incomplete | 3 | 5 |
| expandable.aria-expanded | inapplicable | 3 | 5 |
| keyboard.focus-trace | pass | 3 | 5 |
| keyboard.focus-trace | incomplete | 3 | 5 |
| skip-link.same-page | violation | 2 | 3 |
| skip-link.same-page | incomplete | 2 | 3 |
| skip-link.same-page | inapplicable | 2 | 4 |

## Interpretation

This is a useful first field result precisely because it is **mixed**.

The keyboard heuristic can prove some states but still leaves review gaps.

Dialog and expandable detection are not yet broad enough to handle all real municipal UI patterns; repeated `INCOMPLETE` states should become `journey_gap` candidates.

The skip-link detector produced three violation results across two municipalities. These are **not ready for outreach use yet**. The current violation semantics are narrow (recognizable skip link whose target is missing), but they should be validated against fixtures and manual inspection before promotion.

## Product consequence

Journey evidence remains separate from standards/provenance findings.

New report v2 contains:

```text
Deterministic findings
+
Behavioral journeys
```

WATCH compares journey outcomes separately from axe findings.

Example:

```text
keyboard.focus-trace
INCOMPLETE → PASS
= OUTCOME_CHANGED
```

not:

```text
accessibility violation resolved
```

## Learning consequence

Repeated `INCOMPLETE` journey outcomes feed the candidate catalogue as:

```text
sourceType: journey_gap
status: CANDIDATE
proposedDetector: safe_journey
```

No promotion is automatic.
