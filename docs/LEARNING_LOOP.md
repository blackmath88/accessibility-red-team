# Self-Expanding Check Catalogue

Status: architecture + first deterministic implementation

## Principle

Accessibility Red Team may **learn what to inspect next**, but it must not silently redefine what counts as a requirement or violation.

The system is therefore self-expanding, not self-authorizing.

```text
OBSERVE
  ↓
NOVELTY INBOX
  ↓
CANDIDATE CHECK
  ↓
VALIDATE
  ↓
PROMOTE / REJECT
  ↓
CATALOGUE
  ↓
REPLAY AGAINST OLD EVIDENCE
```

## Three layers

### 1. Trusted catalogue

Checks intentionally enabled in production.

Sources include:

- axe-core rules;
- deterministic DOM probes;
- safe browser journeys;
- jurisdiction/profile checks;
- later: promoted custom probes.

Trusted checks are versioned.

### 2. Novelty inbox

Observations that do not yet justify a check.

Examples:

- the same `incomplete` rule appears across several municipalities;
- multiple sites expose the same unexpected DOM/ARIA pattern;
- a safe journey repeatedly encounters a UI state not covered by the current catalogue;
- a page archetype is repeatedly `UNKNOWN`;
- a report requires manual review for the same reason across many sites.

Nothing in the novelty inbox is reported as a newly discovered violation.

### 3. Candidate catalogue

Repeated or high-value novelty becomes a candidate.

A candidate stores:

- stable ID;
- source observation type;
- first/last observed date;
- occurrence count;
- municipality/site count;
- evidence references;
- proposed detector class;
- proposed standard mapping, if any;
- validation status;
- provenance status;
- promotion history.

## Promotion gate

A candidate may be promoted only if:

1. the phenomenon is reproducible;
2. a deterministic detector can be described;
3. false-positive behavior is understood;
4. expected output semantics are defined;
5. requirement/provenance mapping is explicit or intentionally absent;
6. regression fixtures exist.

AI may help describe or cluster candidates, but MUST NOT promote a rule.

## Catalogue status

```text
OBSERVED
CANDIDATE
VALIDATED
PROMOTED
REJECTED
DEPRECATED
```

## Learning sources

### Repeated incomplete findings

Example:

```text
axe.color-contrast : incomplete
5 municipalities
177 occurrences
```

This does not become a violation rule.

It may become a candidate such as:

> "Add a deterministic visual contrast capture/review probe for cases axe cannot resolve."

### Repeated UNKNOWN page archetypes

If the same structural/URL pattern repeatedly remains UNKNOWN, add a candidate classifier rule.

### Repeated journey gaps

If menus/dialogs/accordions repeatedly fail to match known journey adapters, add a candidate journey detector.

### New standards or jurisdiction requirements

These enter through source/provenance research, not automated promotion.

## Replay

Promotion is incomplete until the new rule is replayed against retained evidence where possible.

This lets us answer:

```text
Did the website change?
or
Did our catalogue get smarter?
```

WATCH must distinguish those.

## AI budget

Default learning loop: zero AI.

Optional semantic compiler uses:

- cluster candidate descriptions;
- choose one label from a bounded taxonomy;
- suggest a human-readable title.

All promotion decisions and rule execution remain deterministic.
