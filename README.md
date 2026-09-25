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


## Engineering principle: minimum AI

The core scanner is designed to work **without an LLM**. Deterministic code owns discovery policy, capture, accessibility probes, provenance, verification and longitudinal comparison.

AI is added only at unresolved semantic boundaries as a **typed semantic compiler**: bounded evidence in, a small legal decision space out. Open-ended agentic planning is an exceptional escalation path, not the default architecture.

See [docs/SEMANTIC_COMPILER.md](docs/SEMANTIC_COMPILER.md) and [ADR-0011](docs/adr/0011-minimum-ai-semantic-compiler.md).


## First executable slice

Slice 0 is scaffolded as a deterministic single-page probe.

```bash
npm install
npm run playwright:install
npm run check
npm run scan -- https://example.com --out runs/example
```

A run writes:

```text
manifest.json
snapshot.json
probe-results.json
summary.json
page.png
```

The manifest records `aiCalls: 0`. Accessibility results retain axe's separate violation / incomplete / pass / inapplicable states and normalize WCAG criterion tags without claiming full WCAG conformance.

See [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) for the staged implementation plan.


## Provenance-aware report

After a scan, build a deterministic report using an explicit jurisdiction profile:

```bash
npm run report -- runs/example \
  --profile requirements/profiles/ch.federal.yml
```

This writes `report.json` and `report.html`. For mapped findings the report exposes:

```text
observed evidence
→ WCAG criterion
→ applicable jurisdiction profile
→ incorporating/adopting source
→ authority class
→ requirement strength
```

The report generator makes no LLM calls. Cantonal profiles currently exist for Zürich, Bern and Basel-Stadt administrations; they must not be used to claim municipality-level applicability without a municipal/cantonal source establishing that scope.
