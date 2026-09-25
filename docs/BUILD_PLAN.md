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

### Slice 0 — single-page evidence probe — IN BUILD

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

### Slice 1 — deterministic Scout

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

### Slice 2 — provenance resolver + deterministic report

- load jurisdiction profile;
- map technical findings to WCAG criteria;
- map WCAG criteria to adopted/binding source chain;
- render requirement strength separately from accessibility impact;
- deterministic HTML report;
- expose “Why is this a requirement?” chain.

### Slice 3 — triage / deduplication

- occurrence fingerprint;
- page-template fingerprint;
- collapse repeated template-level issues;
- prevalence;
- explicit dimensions: impact, confidence, prevalence, template leverage.

### Slice 4 — safe journeys

Initial journeys:

- keyboard tab order / visible focus;
- skip link;
- menu expansion;
- dialog open/close/focus containment;
- accordion expansion;
- zoom/text-size state.

No form submission or actions with unclear server-side effects.

### Slice 5 — WATCH

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
