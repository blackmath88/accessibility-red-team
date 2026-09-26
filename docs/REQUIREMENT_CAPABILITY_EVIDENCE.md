# Requirement → Capability → Evidence

Status: first executable slice

The observatory must expose not only what it found, but what it was capable of observing.

A single percentage such as “29.5% automated coverage” is deliberately rejected: counting WCAG criteria does not measure the share of real accessibility barriers observable on a site.

## Model

```text
requirement
  ↓
capability declaration
  ├── deterministic
  ├── behavioral
  ├── semantic
  └── human review
  ↓
evidence
  ↓
claim
```

Capability strength is one of `NONE | WEAK | PARTIAL | STRONG`. These values describe the observatory's evidence capability, not WCAG conformance.

The first registry intentionally contains only representative criteria spanning different boundaries:

- 1.1.1 Text Alternatives
- 2.4.3 Focus Order
- 2.5.8 Target Size (Minimum)
- 3.3.3 Error Suggestion

This is a seed for validation, not a claim that the catalogue is complete.

## Axe / WCAG 2.2 rule policy

The default scanner remains conservative. We do not silently switch the entire scan to `wcag22aa`.

Instead, the coverage manifest records that WCAG 2.2 axe rules disabled by default are not part of the default evidence surface. A dedicated experiment/test should establish the behavior and false-positive characteristics of `target-size` before it is promoted into the default probe configuration.

## Invariant

No coverage declaration may imply:

- full WCAG conformance;
- that an unobserved criterion passed;
- that a semantic model can replace human conformance review;
- that a raw count of automated criteria is an accessibility score.

Coverage metadata is provenance about the scanner itself.
