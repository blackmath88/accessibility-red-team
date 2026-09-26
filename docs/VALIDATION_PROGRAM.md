# Validation & Field-Growth Program

Status: pre-deployment quality strategy

## Principle

Accessibility Red Team should not go directly from development to public outreach.

It should mature through deliberately selected environments that expose different site shapes, CMS patterns, accessibility behaviors and jurisdictional contexts.

The goal is to let the system **grow evidence, rules, candidates, fixtures and confidence before deployment**.

```text
LOCAL FIXTURES
  ↓
KNOWN PUBLIC TEST SITES
  ↓
SMALL CONTROLLED MUNICIPAL COHORTS
  ↓
DIVERSE REGIONAL COHORTS
  ↓
CANTON-SCALE SHADOW RUNS
  ↓
OUTREACH DRY RUN
  ↓
LIMITED PILOT OUTREACH
  ↓
BROADER DEPLOYMENT
```

No stage is skipped automatically.

---

## Stage 0 — Local controlled fixtures

Purpose:

- prove individual probes;
- force known pass/fail/incomplete states;
- test provenance mappings;
- test WATCH;
- test catalogue promotion/replay.

Fixtures should include:

- labelled/unlabelled form fields;
- correct/incorrect landmarks;
- heading order examples;
- contrast cases;
- missing/valid alt text;
- skip-link examples;
- menu/dialog/accordion fixtures;
- deliberate UNKNOWN cases.

Acceptance:

- expected deterministic result for every fixture;
- zero unexplained regressions;
- fixtures versioned in Git;
- promoted custom rules require fixtures.

---

## Stage 1 — Known public test sites

Purpose:

- exercise networking/rendering safely;
- validate browser behavior outside fixtures;
- check screenshots, DOM capture and artifacts;
- validate failure/retry paths.

These sites are not used to infer broad quality conclusions.

---

## Stage 2 — Small controlled municipality cohorts

Example already established:

`ch.zh.small-pilot`

- Volken
- Maschwanden
- Truttikon
- Ossingen
- Bachs

Purpose:

- expose real small-administration websites;
- compare different IA/CMS patterns;
- mine candidate checks;
- validate representative-surface strategy;
- find repeated remediation families.

Rules:

- manual execution only;
- low page/surface budget;
- no outreach;
- no public ranking;
- municipality legal applicability may remain UNKNOWN.

Outputs:

- per-site reports;
- cohort issue families;
- candidate catalogue;
- Scout baseline;
- runtime metrics;
- false-positive review notes.

---

## Stage 3 — Diverse regional cohorts

Create deliberately different cohorts rather than simply adding more sites.

Dimensions:

### Size

- very small municipality
- small municipality
- mid-sized municipality
- city

### Site architecture

- classic municipal CMS
- custom site
- service portal
- document-heavy
- external-service handoffs
- multilingual

### Geography

- rural
- suburban
- urban

### Governance maturity

Where observable:

- explicit accessibility statement
- feedback mechanism
- no accessibility information

The goal is **coverage of system shapes**, not statistical representativeness yet.

Suggested cohort size:

5–10 sites each.

---

## Stage 4 — Canton-scale shadow run

A shadow run scans a materially larger part of one canton but produces no outreach.

Purpose:

- operational scaling;
- crawler/site etiquette;
- timeout/failure behavior;
- storage size;
- runtime economics;
- distribution of findings;
- identify CMS/provider clusters;
- test candidate catalogue stability.

Before this stage:

- rate limiting must be explicit;
- per-host budgets fixed;
- User-Agent/contact info finalized;
- failure/retry policy documented;
- artifacts storage policy decided;
- opt-out mechanism designed.

Outputs should distinguish:

```text
SCAN SUCCESS
SCAN PARTIAL
SCAN BLOCKED
SITE UNAVAILABLE
UNSUPPORTED SURFACE
```

Do not convert scan failure into accessibility failure.

---

## Stage 5 — Outreach dry run

Generate everything except sending.

For each selected municipality produce:

- final report;
- evidence excerpts;
- "why this matters";
- provenance chain;
- quick-win shortlist;
- draft email;
- confidence/review state.

Then review manually.

Quality questions:

1. Would we be comfortable receiving this message?
2. Is every strong statement supported?
3. Are incomplete findings clearly separated?
4. Is any legal wording overstated?
5. Are suggested fixes actually actionable?
6. Is this useful enough to justify contacting the municipality?

Target:

20–30 dry-run reports before sending the first external message.

---

## Stage 6 — Limited outreach pilot

Very small cohort.

Suggested:

3–5 municipalities.

Selection criteria:

- report quality manually verified;
- at least one clear low-effort improvement;
- no unresolved provenance ambiguity in claims we plan to make;
- no severe scan uncertainty;
- contact route is appropriate.

Tone:

supportive, specific, non-ranking.

Track:

- delivery;
- reply;
- correction requests;
- false-positive feedback;
- usefulness feedback;
- fixes observed later.

Human feedback enters the learning loop.

---

## Stage 7 — Broader deployment

Only after:

- multiple cohorts;
- at least one shadow run;
- outreach dry run;
- limited outreach feedback;
- stable catalogue;
- stable report wording;
- known failure modes.

Deployment remains incremental.

---

# Growth loop

Every field run feeds four stores:

```text
EVIDENCE STORE
What did we actually observe?

REGRESSION FIXTURES
What must never break again?

CANDIDATE CATALOGUE
What should the system learn next?

QUALITY LOG
Where were we wrong, unclear or unhelpful?
```

The candidate catalogue grows.

The trusted catalogue grows only through validation and promotion.

---

# Promotion gates

A candidate check is not promoted because it is frequent.

Frequency means:

> inspect this.

Promotion requires:

- reproducibility;
- meaningful user impact;
- deterministic/bounded detector;
- known outcome semantics;
- false-positive evaluation;
- regression fixtures;
- provenance classification;
- evidence from more than one site pattern where appropriate.

---

# Quality metrics

Avoid one composite score.

Track engineering quality separately:

## Discovery

- Scout coverage
- UNKNOWN rate
- duplicate/template sampling rate
- failed-page rate

## Probe quality

- deterministic findings
- incomplete rate
- manually confirmed false-positive rate
- manually confirmed true-positive rate

## Reporting

- unsupported-claim rate
- provenance resolution rate
- findings per report
- repeated/template-level finding ratio

## Operations

- scan duration
- pages/surfaces per site
- artifact size
- blocked/timeout rate

## Learning

- candidates created
- candidates promoted
- candidates rejected
- candidate recurrence across cohorts
- replay regressions

## Outreach later

- response rate
- correction rate
- usefulness feedback
- observed fixes on rerun

---

# Release gates

## Alpha

- fixtures + small cohorts only
- no outreach

## Beta / shadow

- canton-scale scans allowed
- reports internal only

## Pilot

- 3–5 manually reviewed outreach recipients

## Deployment

- repeatable cohort/shadow process
- stable provenance
- stable catalogue
- human-reviewed outreach policy

---

# Operating rule

**Do not increase geographic scale and semantic ambition at the same time.**

Example:

Good:

```text
same deterministic checks
→ more municipalities
```

or:

```text
same small cohort
→ new safe journey checks
```

Bad:

```text
new journey engine
+ new AI classifier
+ all Zürich municipalities
+ automatic outreach
```

One uncertainty dimension at a time.
