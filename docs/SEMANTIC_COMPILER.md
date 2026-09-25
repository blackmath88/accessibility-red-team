# Semantic Compiler / Minimum-AI Architecture

Status: architectural principle

## Principle

Traditional software owns the workflow.

AI is not the planner, orchestrator, source of truth, or default parser. It is a **bounded semantic compiler** used only when deterministic computation cannot cheaply resolve ambiguity.

The architecture should always ask:

> What is the smallest remaining semantic decision?

Then expose only that decision to the smallest model that can reliably make it.

This is intentionally the opposite of "give an agent the website and ask it to audit accessibility."

---

## The decision ladder

Every ambiguous task follows this escalation ladder:

```text
0. DATA / LOOKUP
   Existing structured information already answers it.
          ↓ unresolved
1. DETERMINISTIC RULE
   Parser, selector, schema, graph/rule lookup, hash, standard mapping.
          ↓ unresolved
2. HEURISTIC / STATISTICAL
   Cheap similarity, clustering, known CMS/template signals.
          ↓ unresolved
3. TYPED SEMANTIC DECISION
   Small LLM chooses from a bounded enum/schema.
          ↓ low confidence / unknown
4. CONSTRAINED SYNTHESIS
   Model produces bounded text from supplied evidence.
          ↓ genuinely open problem
5. AGENTIC ESCALATION
   Exceptional/manual research path only.
```

Each higher level is more expensive, slower, harder to reproduce and harder to benchmark.

The burden of proof is therefore reversed:

> A new LLM call must justify why levels 0–2 cannot solve the problem.

---

## Control-flow invariant

**The model never decides what to do next unless the deterministic orchestrator explicitly asks it to choose from legal next states.**

Bad:

```text
"Explore this municipality website and decide what to test."
```

Good:

```text
Observed site facts
+
legal strategies:
  BROAD_SMALL_SITE
  SITEMAP_SAMPLE
  TEMPLATE_SAMPLE
  TARGETED_INTERACTIVE
  UNKNOWN

→ one typed StrategyDecision
```

Then ordinary code executes the selected strategy.

The LLM does not generate URLs, commands, probes, or arbitrary workflow steps.

---

## Typed uncertainty is mandatory

Semantic outputs must include uncertainty in the schema.

Example:

```python
class PageArchetype(StrEnum):
    HOME = "home"
    ARTICLE = "article"
    SERVICE = "service"
    DIRECTORY = "directory"
    FORM = "form"
    SEARCH = "search"
    SPECIAL_APP = "special_app"
    UNKNOWN = "unknown"

class ArchetypeDecision(BaseModel):
    archetype: PageArchetype
    confidence: float
    evidence_refs: list[str]
```

`UNKNOWN` is a valid and useful answer.

Never force a fuzzy classifier to pretend certainty because the schema has no escape hatch.

---

## AI budget by pipeline stage

### REGISTRY

AI: **none**

Use authoritative structured sources and deterministic jurisdiction mappings.

### SCOUT / RECON

AI target: **near zero**

Deterministic first:

- URL/sitemap/robots discovery;
- DOM statistics;
- link graph;
- path patterns;
- form/document detection;
- CMS/template signatures;
- DOM structural hashes;
- semantic HTML roles;
- language metadata.

Possible typed AI:

- classify a difficult page into one of a fixed set of archetypes;
- choose among predefined bounded crawl strategies when heuristics are ambiguous.

Never ask an agent to browse freely.

### SURFACE CLUSTERING

AI target: **zero by default**

Prefer:

- structural DOM fingerprints;
- URL families;
- component/template signatures;
- title/heading features;
- deterministic similarity or conventional clustering.

Only use semantic classification for unresolved mixed clusters.

### CAPTURE

AI: **none**

Playwright/browser runtime only.

### PROBE

AI: **none**

axe-core, DOM rules, browser-state checks and deterministic custom probes.

No model determines accessibility pass/fail when a machine rule exists.

### SAFE JOURNEY SELECTION

AI target: **low / optional**

Known components map deterministically:

```text
button[aria-expanded] → expandable journey
dialog trigger        → dialog journey
nav toggle            → menu journey
form                   → keyboard/form journey
```

If component intent is ambiguous, a small classifier may choose from a fixed journey enum.

The model may select a legal journey. It may not invent browser actions.

### TRIAGE / DEDUPLICATION

AI target: **zero initially**

Use stable fingerprints, rule IDs, DOM/template signatures and occurrence analysis.

Semantic grouping is optional only after deterministic grouping leaves meaningful unresolved cases.

### REQUIREMENT / PROVENANCE RESOLUTION

AI: **none in normal execution**

This is a versioned rule graph:

```text
probe finding
→ WCAG criterion
→ technical standard
→ jurisdiction profile
→ authority assertion
```

The report must never ask an LLM whether something is legally required.

### IMPACT TEXT

AI target: **zero for standard cases**

Maintain versioned remediation/impact copy for known rules.

Example:

```text
axe.label
→ known impact template
→ known WCAG mapping
→ known remediation template
```

Generate language variants from maintained templates where possible.

Use constrained generation only when the evidence pattern falls outside maintained copy.

### QUICK-WIN CLASSIFICATION

Prefer deterministic dimensions:

- impact;
- prevalence;
- template leverage;
- known remediation class;
- confidence.

If a semantic judgment remains necessary, expose a tiny enum:

```text
LIKELY_LOW_EFFORT
LIKELY_COMPONENT_FIX
LIKELY_CONTENT_FIX
UNCERTAIN
```

No free-form planning.

### VERIFY

AI target: **zero for deterministic claims**

Schema validation + provenance graph + evidence checks.

Use an LLM entailment check only for model-generated natural-language claims.

Better still: avoid generating those claims when a template can express them.

### REPORT

AI target: **zero or one constrained synthesis call**

The default report can be assembled deterministically from:

- finding templates;
- evidence;
- source provenance;
- priority dimensions;
- change state.

Optional LLM use: a short municipality-specific summary built from verified findings only.

### WATCH

AI: **none**

Diff fingerprints and run metadata deterministically.

### OUTREACH

AI target: **optional constrained generation**

A deterministic mail template can cover most municipalities.

A small model may produce restrained personalization from a typed report summary.

Never expose the raw website to the outreach model.

---

## Semantic compiler pattern

A semantic compiler call has five required properties.

### 1. Bounded input

The model receives only the evidence necessary for the decision.

### 2. Closed output space

Enums, discriminated unions, booleans, IDs, bounded arrays.

### 3. Legal options generated by code

The model selects; it does not invent.

### 4. Confidence / UNKNOWN

Ambiguity must be representable.

### 5. Deterministic consumer

Normal code validates the output and executes the next step.

Example:

```text
DETERMINISTIC CODE
finds 12 pages whose template cluster is ambiguous
        ↓
SEMANTIC COMPILER
"Which known archetype best describes each page?"
        ↓
[
  { page: p1, archetype: SERVICE, confidence: .96 },
  { page: p2, archetype: UNKNOWN, confidence: .42 }
]
        ↓
DETERMINISTIC CODE
samples SERVICE cluster
routes UNKNOWN to fallback policy
```

No agent loop is needed.

---

## State-machine architecture

Pipeline control should be explicit.

```text
REGISTERED
  ↓
RECON_COMPLETE
  ↓
SURFACES_SELECTED
  ↓
CAPTURED
  ↓
PROBED
  ↓
TRIAGED
  ↓
PROVENANCE_RESOLVED
  ↓
VERIFIED
  ↓
REPORTED
  ↓
COMPARED
```

Each transition has:

- required input schema;
- deterministic preconditions;
- bounded possible outputs;
- failure state;
- retry policy.

Models are invoked *inside* a transition when needed. They do not own transitions.

---

## What this changes in the original architecture

The earlier conceptual phase:

```text
INTERPRET
semantic grouping
likely template cause
plain-language explanation
quick-win hypothesis
```

is too broad.

Replace it with separate narrow capabilities:

```text
TRIAGE
  deterministic grouping

CAUSE_HINT
  deterministic component/template mapping
  → optional bounded semantic classifier

REQUIREMENT_RESOLVE
  deterministic provenance graph

REMEDIATION_RESOLVE
  deterministic rule/template lookup

PRIORITIZE
  deterministic dimensions
  → optional bounded quick-win classifier

SUMMARIZE
  optional constrained language generation
```

This avoids creating a hidden general-purpose agent in the middle of an otherwise deterministic pipeline.

---

## Model routing

Model selection is a runtime policy, not business logic.

Example conceptual tiers:

```text
NO_MODEL
SMALL_CLASSIFIER
SMALL_STRUCTURED
GENERAL_SYNTHESIS
FRONTIER_ESCALATION
```

A task definition declares the maximum permitted tier.

Example:

```yaml
task: classify_page_archetype
max_model_tier: SMALL_CLASSIFIER
output_schema: ArchetypeDecision
fallback: UNKNOWN
```

A frontier model should not silently be substituted just because a small classifier struggles.

Instead:

```text
small model uncertain
→ UNKNOWN
→ deterministic fallback or review
```

Escalation must be an explicit policy decision.

---

## Measure the AI, do not assume it is needed

Every semantic task needs an eval set.

For each candidate LLM call:

1. create a labelled fixture set;
2. implement deterministic baseline;
3. measure baseline;
4. add semantic compiler;
5. compare accuracy, latency and cost;
6. keep AI only if it materially improves the outcome.

Metrics:

```text
accuracy / F1 where relevant
UNKNOWN rate
false-confidence rate
latency
tokens
cost per 1,000 sites
repeatability
model/version sensitivity
```

If a heuristic gets 98% and the remaining 2% can safely become UNKNOWN, the LLM may not belong in production.

---

## Cache semantic decisions

Semantic decisions over immutable evidence should be content-addressed.

Cache key:

```text
task_version
+ schema_version
+ input_evidence_hash
+ model_policy_version
```

This means the same page snapshot does not incur repeated inference during report rebuilds.

It also makes benchmark runs reproducible.

---

## Model-generated content is derived data

Never let model output overwrite observations.

Data lineage:

```text
OBSERVATION
  immutable

DETERMINISTIC DERIVATION
  reproducible

SEMANTIC DECISION
  model + version + schema + evidence refs

PRESENTATION
  disposable / regenerable
```

A model upgrade should allow us to recompute semantic decisions without rescanning the website.

---

## Build implication

The MVP should actually begin with **zero LLMs**.

### M0

```text
URL
→ Playwright
→ axe-core
→ normalized evidence
→ requirement provenance
→ deterministic HTML report
```

### M1

Add deterministic Scout:

```text
municipality root
→ sitemap/link graph
→ structural clustering
→ representative surfaces
```

### M2

Measure where this fails.

Only then introduce the first semantic compiler for the highest-value unresolved ambiguity.

This means AI is an optimization/plugin to the architecture rather than a foundational runtime dependency.

---

## Engineering rule

For every proposed AI feature, the pull request should answer:

1. What semantic ambiguity cannot be solved deterministically?
2. What are the legal output states?
3. Can `UNKNOWN` be returned safely?
4. What is the smallest model tier permitted?
5. What evidence is supplied?
6. What deterministic code consumes the answer?
7. What is the non-AI fallback?
8. How will we evaluate whether this call is worth its cost?

If those questions do not have good answers, do not add the LLM call.
