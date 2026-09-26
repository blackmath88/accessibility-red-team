# Safe Accessibility Journeys

Status: implemented, controlled field validation

## Goal

Static DOM inspection and axe-core cannot establish every accessibility behavior.

Safe journeys add bounded interaction evidence without turning the project into an active security scanner or autonomous browser agent.

## Current catalogue

### keyboard.focus-trace

Actions:

- blur current element;
- press Tab at most 12 times;
- record active element, role, text, rectangle and focus indicator heuristics.

Output:

- PASS only when every sampled target has a clearly detectable focus-visible indicator;
- otherwise INCOMPLETE.

It does **not** declare invisible focus a violation from heuristic evidence alone.

### skip-link.same-page

Actions:

- inspect same-page hash links only;
- recognize likely skip/bypass wording;
- verify target exists;
- inspect whether target is a main landmark.

No external navigation.

Output:

- VIOLATION only when a recognizable skip link references a missing target;
- PASS when it resolves to a main landmark;
- otherwise INCOMPLETE / INAPPLICABLE.

### expandable.aria-expanded

Actions:

- only elements exposing aria-expanded;
- only safe activation targets;
- Enter activation;
- observe aria-expanded change;
- restore state when possible.

Excluded:

- form controls/submission buttons;
- external links;
- targets with unclear side effects.

Output:

- PASS if all sampled controls toggle state;
- otherwise INCOMPLETE.

### dialog.focus-behavior

Actions:

- safe dialog-like trigger only;
- Enter to open;
- detect visible dialog;
- test whether focus moved inside;
- Escape to close;
- test whether focus returned.

Output:

- PASS when focus enter/return behavior is observed;
- otherwise INCOMPLETE / INAPPLICABLE.

## Safety invariant

Every journey result asserts:

```json
{
  "submittedForms": false,
  "followedExternalLinks": false,
  "wroteServerState": false
}
```

If a useful journey cannot be expressed under that invariant, it is not part of the default journey engine.

## Explicitly forbidden

- submit forms;
- send contact requests;
- create/delete/update records;
- upload files;
- payments;
- authentication;
- account creation;
- password reset;
- external-link navigation;
- fuzzing;
- auth bypass;
- bot-protection bypass;
- actions whose server-side effect is unclear.

## Field validation

Journeys are opt-in:

```bash
npm run journey -- https://example.ch --out runs/example-journey
```

or:

```bash
npm run audit -- https://example.ch \
  --out runs/example \
  --profile requirements/profiles/ch.zh.municipal-research.yml \
  --journeys
```

The Zürich journey cohort uses the same municipalities as the passive small pilot, but only two representative surfaces per site.

This follows the validation rule:

> keep geography stable while adding a new semantic/behavioral capability.

## Learning integration

Cohort journey results are grouped by:

```text
journeyId
+ outcome
```

Repeated INCOMPLETE outcomes may enter the candidate catalogue as:

```text
sourceType: journey_gap
proposedDetector: safe_journey
status: CANDIDATE
```

They do not become accessibility violations automatically.
