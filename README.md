# Accessibility Red Team

An evidence-first observatory for the accessibility of Swiss public-sector websites.

The project borrows the operating model of a security red-team scanner — reconnaissance, scoped probes, evidence, triage, verification and repeat scanning — but applies it to accessibility in a deliberately non-adversarial way.

## Product thesis

> Find representative public-service surfaces, test what can be tested reproducibly, explain a small number of useful improvements, and measure whether accessibility improves over time.

The system is not a WCAG certification service. Automated checks can establish some facts and identify things that need review; they cannot prove full conformance.

## Pipeline

```text
Registry
  ↓
SCOUT      discover and select representative surfaces
  ↓
PROBE      run deterministic accessibility probes
  ↓
TRIAGE     normalize, deduplicate and prioritize evidence
  ↓
INTERPRET  turn evidence into useful human-facing explanations
  ↓
VERIFY     ensure every published claim is supported
  ↓
REPORT     municipality report + machine-readable result
  ↓
WATCH      compare runs and track change over time
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture plan and the open-source systems it borrows from.
