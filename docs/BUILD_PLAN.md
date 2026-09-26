# Build Plan

Status: active  
Principle: **minimum AI / evidence first / deterministic control flow**

## Goal

Build a repeatable Swiss public-sector accessibility observatory:

```text
municipality
→ discover representative surfaces
→ capture rendered evidence
→ run deterministic accessibility probes
→ resolve requirement provenance
→ produce actionable report
→ repeat and compare over time
```

The first release is useful without any LLM.

## Borrow / adapt matrix

| Source | Borrow | Do not copy |
|---|---|---|
| public-ai-challenge | bounded recon, typed handoffs, fail-closed provenance philosophy | MCP factory, agent-first orchestration |
| Katana | scope discipline, crawl budgets, resumability | exhaustive endpoint discovery |
| Nuclei | engine/rule separation, stable IDs, profiles, machine-readable output | security payload model, large DSL in v0 |
| OWASP ZAP | passive vs active/safe interaction, impact vs confidence | hostile active scanning |
| axe-core | accessibility rules, node evidence, violation/pass/incomplete/inapplicable | treating axe as complete WCAG certification |
| Pa11y | browser journeys and reporter separation | free-form scripted mutations |

Dependencies are consumed as packages under their own licenses; project code should adapt architectural patterns rather than vendor/copy large source files.

## Technology baseline

- Node.js 22+
- TypeScript
- Playwright
- @axe-core/playwright
- Zod
- JSON artifacts as stage handoffs
- YAML for jurisdiction/probe profiles
- no mandatory LLM dependency

## Vertical slices

### Slice 0 — single-page evidence probe — IMPLEMENTED

Input:

```text
art scan https://public-site.example
```

Output directory:

```text
manifest.json
snapshot.json
probe-results.json
summary.json
page.png
```

Pipeline:

```text
validate public URL
→ launch Chromium
→ capture immutable page snapshot metadata
→ run axe-core
→ normalize rule/node evidence
→ extract WCAG criterion tags
→ emit typed JSON
```

Acceptance:

- rejects localhost/private-network targets;
- one URL can be scanned headlessly;
- raw evidence is preserved;
- violations and incomplete results remain distinct;
- each result records rule ID, impact, tags, node targets and HTML evidence;
- WCAG criterion tags are normalized where possible;
- run metadata pins scanner/browser/axe versions;
- no LLM/API key required.

### Slice 1 — deterministic Scout — IMPLEMENTED

Input: municipality entrypoint.

Deterministic recon:

- robots/sitemap discovery;
- internal link graph;
- URL normalization;
- document/form detection;
- DOM structural fingerprints;
- likely template clusters;
- bounded sampling.

Output: `AccessibilitySurface.json`.

AI budget: zero initially.

Acceptance: representative sample selected with explicit reasons and crawl budget.

### Slice 2 — provenance resolver + deterministic report — IN BUILD

- load jurisdiction profile;
- map technical findings to WCAG criteria;
- map WCAG criteria to adopted/binding source chain;
- render requirement strength separately from accessibility impact;
- deterministic HTML report;
- expose “Why is this a requirement?” chain.

### Slice 3 — triage / deduplication — IMPLEMENTED

- occurrence fingerprint;
- page-template fingerprint;
- collapse repeated template-level issues;
- prevalence;
- explicit dimensions: impact, confidence, prevalence, template leverage.

### Slice 4 — safe journeys — IMPLEMENTED / FIELD VALIDATION

Initial journeys:

- keyboard tab order / visible focus;
- skip link;
- menu expansion;
- dialog open/close/focus containment;
- accordion expansion;
- zoom/text-size state.

No form submission or actions with unclear server-side effects.

### Slice 5 — WATCH — IMPLEMENTED

- immutable benchmark run;
- second-run diff;
- NEW / PERSISTING / RESOLVED / RULE_CHANGED / NOT_COMPARABLE;
- pin profile and engine versions.

### Slice 6 — semantic compiler, only if evidence proves need

Candidate tasks only after deterministic baseline evaluation:

- unresolved page-archetype classification;
- unresolved template grouping;
- bounded quick-win class.

Each call requires a typed schema, UNKNOWN, deterministic fallback and an eval set.

### Slice 7 — outreach

- municipality contact registry;
- deterministic email/report template;
- optional constrained personalization;
- suppression / opt-out;
- outreach audit trail.

## Build order for Slice 0

1. package/tooling
2. Zod contracts
3. public-target scope guard
4. browser capture
5. axe adapter
6. WCAG tag normalization
7. CLI/orchestrator
8. fixture tests
9. README run instructions
10. run against a small public test set

## Definition of done for every slice

- deterministic core path;
- typed inputs/outputs;
- immutable evidence;
- explicit version metadata;
- safe failure state;
- test fixture;
- no hidden model dependency;
- documentation updated;
- longitudinal compatibility considered.


## Current implementation status — 2026-09-25

```text
Slice 0  single-page evidence probe       IMPLEMENTED
Slice 1  deterministic Scout              IMPLEMENTED
Slice 2  provenance + deterministic report IN BUILD
Slice 3  triage / deduplication            NEXT
```

Current jurisdiction profiles:

- Federal Administration — eCH-0059 v3 / WCAG 2.1 AA
- Canton Zürich administration — WCAG 2.2 AA
- Canton Bern administration — WCAG 2.2 AA
- Canton Basel-Stadt administration — WCAG 2.1 AA / eCH-0059 v3

These cantonal profiles do **not** imply municipal applicability. Municipality-specific applicability remains a research/data task.


## Real-site Scout baseline

A manual corpus run on 2026-09-25 validated the deterministic Scout against:

- Gemeinde Ausserberg
- Kanton Zürich
- Stadt Zürich

After fixing shared global form/search chrome contaminating page classification, all three corpus targets passed the baseline expectations.

Baseline artifact: `benchmarks/baselines/scout-2026-09-25.json`.

The permanent `real-sites-scout` workflow is manual-only; normal pushes do not crawl these public sites.

## WATCH usage

```bash
npm run watch -- \
  runs/2026-03/report.json \
  runs/2026-09/report.json \
  --out runs/change-2026-09.json
```

WATCH fails comparability closed when jurisdiction profiles differ and detects probe-version changes separately from website changes.


## Safe journey field validation

The first journey engine is implemented with a strict no-side-effects invariant.

Current journeys:

- keyboard focus trace;
- skip-link target;
- aria-expanded keyboard activation;
- dialog focus enter/return.

A separate controlled cohort exists at:

`cohorts/zh-small-pilot-journeys.yml`

It uses the same five Zürich municipalities as the passive baseline, at most two representative surfaces per site, and is manual-only.

Repeated journey gaps feed the candidate catalogue rather than being promoted automatically.
