# Architecture Plan

Status: **architecture baseline / build plan**  
Project: **Accessibility Red Team**  
Scope: Swiss federal, cantonal and municipal public websites

## 1. The architectural thesis

This should not be built as an "AI accessibility auditor."

It should be built as an **evidence-first scanning system** with an adaptive discovery layer and a semantic reporting layer.

The red-team metaphor is useful because mature security scanners already solve several problems we also have:

- discovering an unknown attack/surface area without crawling forever;
- keeping scans strictly in scope;
- separating passive observation from active interaction;
- expressing checks as reusable rules rather than hard-coded application logic;
- retaining reproducible evidence;
- distinguishing severity from confidence;
- deduplicating thousands of low-level observations into actionable findings;
- replaying scans and detecting regressions;
- producing both machine-readable and human-readable outputs.

The analogy ends where hostile security testing begins. This project MUST NOT fuzz, exploit, submit destructive forms, bypass access controls, or otherwise act adversarially against a public website.

Its "active" behavior is limited to **safe accessibility journeys** such as opening a menu, revealing a dialog, navigating by keyboard, changing viewport/zoom, or moving through a non-submitting form state.

---

## 2. Reference architectures worth borrowing from

### 2.1 ProjectDiscovery Katana — reconnaissance and scope

Repo: <https://github.com/projectdiscovery/katana>

Borrow:

- strict target/scope boundaries;
- bounded crawling by page count, depth and duration;
- headless and non-headless discovery modes;
- sitemap/robots/known-file discovery;
- filtering noisy resources;
- per-host budgets and rate limiting;
- machine-readable output;
- resumable runs;
- page-type classification as an optimization.

Do **not** copy its goal of exhaustive endpoint discovery. Our Scout optimizes for **representative accessibility surface coverage**, not maximum URL coverage.

### 2.2 ProjectDiscovery Nuclei — template-driven probe engine

Repo: <https://github.com/projectdiscovery/nuclei>

Borrow:

- scanner engine separated from rule/template content;
- declarative checks with stable IDs;
- tags/profiles selecting subsets of checks;
- matchers and extractors;
- workflows built from reusable probes;
- reproducible machine-readable results;
- versioned templates/rules;
- regression-friendly execution.

Our accessibility equivalent should allow a probe definition to describe:

- what surface/node/state it applies to;
- which deterministic engine/check to run;
- the standard/profile tags it maps to;
- required evidence;
- confidence semantics;
- remediation metadata;
- whether the result can be automatically asserted or must be marked "needs review."

Do not invent a large DSL in v0. Start with typed Python/TypeScript definitions or JSON/YAML backed by a JSON Schema; extract a DSL only when repetition proves the abstraction.

### 2.3 OWASP ZAP — passive/active separation and triage

Project: <https://www.zaproxy.org/>

Borrow:

- separate **passive** scanning from **active** behavior;
- run passive rules over everything already observed;
- explicit scan policies/profiles;
- rule maturity/status;
- separate **risk/impact** from **confidence**;
- caps to prevent one noisy rule flooding a report;
- scope as a first-class runtime constraint;
- a job pipeline where order matters;
- plugins/adapters around a stable orchestration core.

Adaptation:

| Security scanner | Accessibility Red Team |
|---|---|
| Passive scan | DOM, HTML, CSS, ARIA and response inspection |
| Active scan | Safe browser interaction journey |
| Risk | User impact |
| Confidence | Evidence confidence / automation certainty |
| Alert | Finding |
| Scan policy | Accessibility profile |
| Site tree | Accessibility surface inventory |

### 2.4 axe-core — accessibility rule semantics

Repo: <https://github.com/dequelabs/axe-core>

Borrow directly rather than reimplementing:

- the rule/check decomposition;
- stable rule IDs;
- rule metadata and standards tags;
- node-level targets and HTML evidence;
- impact levels;
- critically, the distinction between **violations**, **passes**, **incomplete**, and **inapplicable**.

"Incomplete" is architecturally important: it prevents the system from forcing a binary answer where automation cannot decide.

axe-core should be one probe engine, not the architecture itself.

### 2.5 Pa11y / Pa11y CI — journeys, runners and reporters

Repos:

- <https://github.com/pa11y/pa11y>
- <https://github.com/pa11y/pa11y-ci>

Borrow:

- browser actions before a check;
- multiple accessibility runners;
- URL/sitemap input;
- reusable configuration;
- isolated browser contexts;
- reporters independent from scanning;
- CI-style exit/status semantics.

For us, actions become safe **journeys**:

```text
open mobile menu
→ inspect expanded navigation

tab through page
→ capture focus order / focus visibility

open modal
→ inspect dialog semantics and focus containment

expand accordion
→ inspect revealed content
```

### 2.6 public-ai-challenge — adaptive Scout + typed handoffs

Repo: <https://github.com/dominik-scherrer/public-ai-challenge>

Borrow heavily:

- recon before crawl;
- adaptive broad-vs-targeted discovery;
- bounded runtime;
- immutable page/evidence intermediate representation;
- semantic interpretation after collection, not during collection;
- typed JSON handoffs;
- provenance gate / "say less rather than say something unsupported";
- deterministic fallbacks.

This is the closest architectural parent.

---

## 3. Proposed system

```text
                         ┌──────────────────┐
                         │ Municipality     │
                         │ Registry         │
                         └────────┬─────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────┐
│ 1. SCOUT                                                  │
│ recon → classify site → discover → cluster → sample       │
│                                                           │
│ Output: AccessibilitySurface                              │
└─────────────────────────┬─────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────┐
│ 2. CAPTURE                                                │
│ fetch + render representative surfaces                    │
│ DOM + accessibility tree + screenshot + metadata          │
│                                                           │
│ Output: SurfaceSnapshot                                   │
└─────────────────────────┬─────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
┌──────────────────────────┐   ┌────────────────────────────┐
│ 3A. PASSIVE PROBES       │   │ 3B. SAFE JOURNEYS         │
│ axe / HTML / ARIA / CSS  │   │ keyboard/menu/modal/form  │
│ no site mutation         │   │ no submission/destruction │
└────────────┬─────────────┘   └──────────────┬─────────────┘
             └──────────────┬─────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────┐
│ 4. TRIAGE                                                 │
│ normalize → fingerprint → deduplicate → group → impact    │
│                                                           │
│ Output: EvidenceFinding[]                                 │
└─────────────────────────┬─────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────┐
│ 5. INTERPRET                                              │
│ semantic grouping, likely template cause, plain language  │
│ remediation explanation, "quick win" hypothesis           │
│                                                           │
│ Output: FindingClaim[]                                    │
└─────────────────────────┬─────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────┐
│ 6. VERIFY                                                 │
│ provenance gate + reproducibility + claim/evidence checks │
│ unsupported statements are withheld                      │
│                                                           │
│ Output: VerifiedFinding[]                                 │
└─────────────────────────┬─────────────────────────────────┘
                          │
              ┌───────────┴────────────┐
              ▼                        ▼
        ┌───────────┐             ┌────────────┐
        │  REPORT   │             │   WATCH    │
        │ HTML/JSON │             │ run diff   │
        └───────────┘             └────────────┘
```

---

## 4. Core data contracts

The contracts are more important than the agent framework.

### 4.1 AccessibilitySurface

Scout's output: what we decided to inspect and why.

```json
{
  "schema": "art/surface/v1",
  "organization_id": "ch-bs-riehen",
  "entrypoint": "https://example.ch/",
  "site_profile": "structured_municipality",
  "languages": ["de"],
  "surfaces": [
    {
      "surface_id": "surface_service_01",
      "kind": "service",
      "url": "https://example.ch/service/umzug",
      "template_cluster": "service-detail",
      "selection_reason": "representative citizen-service template"
    }
  ]
}
```

### 4.2 SurfaceSnapshot

Immutable evidence bundle for one rendered state.

Minimum fields:

- run ID;
- surface ID;
- canonical URL;
- timestamp;
- response metadata;
- content hash;
- rendered DOM or normalized relevant DOM;
- accessibility-tree extract where available;
- viewport/device profile;
- screenshot reference;
- engine/browser versions;
- journey/state that produced the snapshot.

### 4.3 ProbeResult

Raw result from one deterministic probe engine.

```json
{
  "schema": "art/probe-result/v1",
  "probe_id": "axe.label",
  "probe_version": "4.x",
  "surface_id": "surface_form_01",
  "state_id": "initial",
  "outcome": "violation",
  "impact": "serious",
  "targets": ["#email"],
  "evidence": {
    "html": "<input id=\"email\">"
  },
  "tags": ["wcag2a", "wcag412"]
}
```

Outcome SHOULD support at least:

```text
pass
violation
incomplete
inapplicable
error
```

Do not collapse `incomplete` into failure.

### 4.4 EvidenceFinding

Normalized unit after deduplication.

Important dimensions:

- rule/probe;
- surface archetype;
- node fingerprint;
- template fingerprint where available;
- impact;
- confidence;
- occurrence count;
- representative evidence refs.

A finding may occur on 87 URLs but still represent one CMS-template problem.

### 4.5 VerifiedFinding

What may be shown to a municipality.

Every human-facing claim must refer to supporting evidence.

Suggested claim status:

```text
OBSERVED       deterministic evidence
SUPPORTED      interpretation demonstrably supported by evidence
NEEDS_REVIEW   automation cannot establish it conclusively
WITHHELD       insufficient/contradictory evidence
```

---

## 5. Scout: coverage by archetype, not by URL count

The Scout's job is not "crawl the website."

Its job is:

> produce the smallest set of surfaces that reasonably represents the site's meaningful public-service interaction patterns.

Recon should gather:

- sitemap and robots information;
- homepage structure;
- internal link count;
- CMS/platform hints;
- dominant templates;
- service directories;
- search;
- forms;
- document links;
- external official handoffs;
- language variants.

Then cluster likely page archetypes:

```text
homepage
navigation/search
article/information
service-detail
directory/list
form
document/PDF
external handoff
special interactive application
```

Sampling policy can then select e.g. 1–3 examples per archetype.

This is the biggest scalability win for a national benchmark.

---

## 6. Probe engine

### 6.1 Engine adapters

v0 adapters:

1. **axe-core via Playwright** — primary automated accessibility engine.
2. **DOM structural probes** — custom deterministic checks where useful.
3. **browser journey probes** — keyboard/focus/dialog/menu behavior.
4. Later: **document/PDF adapter** with a deliberately separate evidence model.

Do not merge PDF checking into HTML checking just because both are called accessibility.

### 6.2 Profiles

Rules should be selected through versioned profiles, not hard-coded into the orchestrator.

Examples:

```text
profiles/
  swiss-public-web.yml
  wcag-2.1-aa.yml
  wcag-2.2-aa.yml
  exploratory.yml
```

A profile pins:

- standard/version;
- enabled probes;
- journey set;
- viewport/device matrix;
- thresholds;
- reporting policy.

This protects longitudinal comparability when standards or engines change.

### 6.3 Rule metadata

Borrow ZAP/Nuclei-style metadata:

```yaml
id: keyboard.visible-focus
title: Keyboard focus should remain visible
kind: journey
status: experimental

standards:
  - wcag:2.4.7

impact: serious
automation:
  confidence: medium
  requires_review: true

evidence:
  required:
    - focus_sequence
    - screenshot
```

Keep **impact** and **confidence** separate.

---

## 7. Passive probes vs safe journeys

This distinction should be enforced in code.

### PASSIVE

Can inspect already-rendered evidence without changing site state:

- headings;
- landmarks;
- names/labels;
- ARIA;
- contrast;
- language metadata;
- DOM order;
- alt attributes;
- duplicate IDs;
- semantic structure.

### SAFE JOURNEY

May change UI state but MUST NOT create meaningful server-side effects:

- Tab/Shift+Tab;
- open/close menu;
- expand/collapse accordion;
- open/close modal;
- choose viewport;
- increase zoom/text size;
- focus fields without submission;
- activate skip link.

### FORBIDDEN BY DEFAULT

- submitting contact/applications;
- creating records;
- uploading files;
- triggering payments;
- account login;
- bypassing authentication;
- brute force/fuzzing;
- any action with unclear side effects.

Runtime should fail closed when a journey attempts a forbidden action.

---

## 8. Triage: where the product becomes useful

Raw scanners are noisy. A municipality does not need 240 DOM-level alerts.

Triage should perform:

### Canonicalization

Normalize engine-specific output into our schema.

### Fingerprinting

Stable-ish fingerprint composed from:

```text
organization
surface archetype
rule
normalized DOM path / semantic locator
template fingerprint
```

Never rely on raw CSS selectors alone for longitudinal identity.

### Deduplication

Collapse repeated manifestations of the same probable template defect.

### Prevalence

Retain:

- affected sampled pages;
- occurrence count;
- percent of sampled archetype affected.

### Priority

Do not invent one magic "accessibility score."

Rank remediation opportunities from explicit dimensions:

- user impact;
- evidence confidence;
- prevalence;
- likely remediation effort;
- template leverage.

"Quick win" is an interpretation derived from those dimensions, not a WCAG severity.

---

## 9. Semantic interpretation: where the LLM belongs

The LLM may:

- explain technical findings in plain language;
- group related observations;
- hypothesize a common template/component cause;
- draft a remediation explanation;
- identify a probable low-effort/high-leverage change;
- produce German/French/Italian variants;
- draft the friendly outreach summary.

The LLM MUST NOT:

- invent findings;
- determine pass/fail where a deterministic engine can;
- silently convert `incomplete` into violation;
- claim WCAG conformance;
- fabricate user impact or affected populations without evidence;
- emit a report statement without source references.

Think of this layer as a **semantic compiler over bounded evidence**.

---

## 10. Verify / provenance gate

Borrow the public-ai-challenge Judge philosophy.

Before publication:

1. Does the claim have evidence?
2. Does the evidence still reproduce?
3. Does the claim overstate the automated result?
4. Is the standard mapping present and versioned?
5. If interpretation is model-generated, is it entailed by the supplied evidence?
6. Does it need human review?

Fail closed:

```text
no evidence       → WITHHELD
contradiction     → WITHHELD
automation unsure → NEEDS_REVIEW
supported         → publishable
```

For high-confidence deterministic findings, an LLM judge should not be necessary.

---

## 11. Watch: longitudinal scanning is a first-class subsystem

A benchmark run is immutable.

```text
BenchmarkRun
├── profile version
├── probe versions
├── browser/runtime versions
├── organization set
├── start/end timestamps
└── findings
```

Comparison states:

```text
NEW
PERSISTING
RESOLVED
NOT_REPRODUCIBLE
SURFACE_REMOVED
SURFACE_CHANGED
RULE_CHANGED
NOT_COMPARABLE
```

The last two matter: a scanner upgrade must not be presented as a municipality improving or regressing.

Store enough raw evidence to re-normalize an old run when possible.

---

## 12. Storage model

Start boring.

For MVP:

- PostgreSQL or SQLite for metadata/results;
- filesystem/S3-compatible object storage for screenshots and evidence bundles;
- JSON artifacts as stable handoff/debug outputs.

Core entities:

```text
organizations
sites
benchmark_runs
scan_runs
surfaces
snapshots
probe_results
findings
finding_occurrences
claims
reports
outreach_events
```

Avoid a graph database until real queries require one.

---

## 13. Execution architecture

MVP can be one repository and one deployable service with workers.

```text
Scheduler / CLI
      │
      ▼
Scan Orchestrator
      │
      ├── Scout worker
      ├── Browser worker (Playwright)
      ├── Probe adapters
      ├── Triage
      ├── Interpreter
      ├── Verifier
      └── Reporter
               │
               ▼
        DB + object storage
```

Use queues only when national runs require them.

A national benchmark should be restartable and idempotent:

```text
run municipality X
→ immutable run_id
→ stage checkpoints
→ resume failed stage
```

---

## 14. Safety and scan etiquette

This is public-interest infrastructure; scanner behavior must itself be responsible.

Required controls:

- identifiable User-Agent with project/contact URL;
- respect robots policy for discovery unless a documented public-interest exception is intentionally adopted later;
- strict same-site/domain scope by default;
- conservative per-host concurrency;
- global and per-host rate limits;
- request/page budgets;
- backoff on 429/5xx;
- no authentication;
- no destructive actions;
- no form submission by default;
- no bypass of bot protection;
- redact accidentally encountered personal/sensitive values from retained evidence where feasible;
- audit log of every request and journey action.

A site's instability should result in **scan incomplete**, not increasingly aggressive retries.

---

## 15. Report architecture

The report is a view over verified findings, not a second source of truth.

Outputs:

### Machine

`report.json`

- versioned schema;
- evidence references;
- comparison to prior run;
- all publishable findings;
- needs-review items separately.

### Municipality view

Lead with actionable remediation, not shame:

```text
4 useful improvements
2 likely shared-template fixes
1 item needs human review

[quick win]
Form labels
Observed on 3 representative service pages
Why it matters
How to fix
Show evidence
```

### Benchmark

Aggregate carefully:

- prevalence of issue categories;
- change over time;
- proportion resolved/persisting/new;
- confidence/comparability metadata.

Avoid a simplistic league table unless methodology later justifies it.

---

## 16. What not to build yet

Not v0:

- MCP server;
- autonomous multi-agent swarm;
- custom accessibility engine replacing axe;
- exhaustive crawler;
- full PDF certification;
- public ranking/leaderboard;
- automatic email sending;
- vector database;
- graph database;
- complex workflow DSL;
- Kubernetes.

MCP can later be an adapter over the data/API if external assistants need tools like `get_report`, `compare_runs`, or `rescan_site`. It is not part of the scan pipeline.

---

## 17. Suggested repository structure

```text
accessibility-red-team/
├── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── SAFETY.md
│   └── adr/
├── profiles/
│   ├── swiss-public-web.yml
│   └── exploratory.yml
├── src/
│   └── art/
│       ├── registry/
│       ├── scout/
│       ├── capture/
│       ├── probes/
│       │   ├── axe/
│       │   ├── dom/
│       │   └── journeys/
│       ├── triage/
│       ├── interpret/
│       ├── verify/
│       ├── watch/
│       ├── report/
│       └── contracts/
├── tests/
│   ├── fixtures/
│   ├── scout/
│   ├── probes/
│   └── regression/
└── runs/              # gitignored local artifacts
```

---

## 18. MVP build sequence

### M0 — contracts + one-page probe

Goal: one URL in, evidence-backed JSON out.

- define schemas;
- Playwright capture;
- axe-core adapter;
- immutable snapshot;
- normalized probe results.

Acceptance:

```text
art scan https://example.ch
→ snapshot.json
→ probe-results.json
```

### M1 — Scout + representative surfaces

Goal: municipality root in, bounded representative sample out.

- recon;
- sitemap/internal-link discovery;
- archetype classifier;
- sampling;
- hard scope/budget limits.

Acceptance:

```text
art scout <municipality>
→ AccessibilitySurface.json
```

### M2 — triage + report

Goal: useful rather than noisy.

- fingerprints;
- dedup/grouping;
- prevalence;
- evidence viewer;
- HTML report.

### M3 — safe journeys

- keyboard journey;
- menu/dialog/accordion states;
- focus evidence;
- journey safety policy.

### M4 — semantic interpreter + verifier

- plain-language explanations;
- common-cause grouping;
- quick-win hypotheses;
- provenance/entailment gate.

### M5 — Watch

- immutable benchmark run;
- diff/finding lifecycle;
- comparability rules;
- second-run report.

### M6 — campaign layer

- contact registry;
- draft outreach;
- opt-out/suppression;
- report links;
- record outreach and responses.

Automatic sending should be a separate operational decision, not coupled to scanning.

---

## 19. Initial engineering decisions

1. **Browser runtime:** Playwright.
2. **Primary accessibility engine:** axe-core.
3. **Scout:** adapt the concepts/code boundaries from public-ai-challenge, but target page archetypes rather than public services.
4. **Probe architecture:** Nuclei-inspired, declarative and versioned.
5. **Safety model:** ZAP-inspired passive vs safe-active/journey distinction.
6. **Result semantics:** axe-inspired violation/pass/incomplete/inapplicable.
7. **Interaction scripting:** Pa11y-inspired journeys.
8. **LLM role:** semantic interpretation only after evidence.
9. **No MCP in core.**
10. **No single composite score in v0.**
11. **Longitudinal comparability is a v0 data-model requirement, even if WATCH ships later.**

---

## 20. First ADRs to write

- ADR-0001 — Evidence before interpretation.
- ADR-0002 — Representative surface sampling over exhaustive crawling.
- ADR-0003 — Passive probes and safe journeys are separate capabilities.
- ADR-0004 — Impact and confidence are independent.
- ADR-0005 — Incomplete is a first-class result, not a failure.
- ADR-0006 — Published claims require provenance.
- ADR-0007 — Version scan profiles for longitudinal comparability.
- ADR-0008 — No composite accessibility score in v0.
- ADR-0009 — LLMs do not determine deterministic conformance.
- ADR-0010 — MCP is an optional adapter, not pipeline infrastructure.

---

## 21. The concise mental model

```text
SCOUT
Where should we look?

CAPTURE
What state did we actually observe?

PROBE
What can machines establish?

TRIAGE
What is the underlying problem rather than the repeated symptom?

INTERPRET
How can we make the evidence useful to a maintainer?

VERIFY
Can we defend every sentence we're about to publish?

REPORT
What should this municipality change next?

WATCH
Did it actually get better?
```

That is the architecture.
