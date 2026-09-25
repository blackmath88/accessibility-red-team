# Requirements & Provenance Model

Status: baseline, 2026-09-25

## Why this exists

Accessibility Red Team must be able to answer a simple question for every reported finding:

> **Why are you telling us this is a requirement?**

A scanner rule is not itself a legal requirement.

For Swiss public-sector websites, a useful finding can be backed by several different kinds of authority:

1. constitutional / international-law obligation;
2. federal or cantonal legislation;
3. a binding administrative or ICT standard;
4. a technical standard incorporated by reference;
5. an official implementation guideline;
6. recognised best practice.

These must never be presented as equivalent.

The system therefore stores a **provenance chain**, not just a WCAG tag.

---

## 1. Current Swiss baseline

### Federal Administration

The federal legal/policy chain is approximately:

```text
Federal Constitution / UN CRPD
        ↓
Disability Discrimination Act (BehiG)
+ Disability Discrimination Ordinance (BehiV)
+ EMBAG accessibility principle
        ↓
binding federal ICT requirement
eCH-0059 Accessibility Standard v3
        ↓
WCAG 2.1 Level AA
```

The Federal Office for the Equality of People with Disabilities (EBGB) states that eCH-0059 v3 is a **binding requirement in the Federal Administration**.

eCH-0059 v3 requires, among other things:

- websites and mobile applications: WCAG 2.1 AA;
- published documents: accessible according to WCAG 2.1; PDF/UA is recommended for PDF;
- selected information in central areas of life: Easy Language and sign-language video;
- accessibility statement;
- feedback mechanism.

Important: eCH-0059 contains both normative requirements and informative/recommended material. We must preserve that distinction.

### Cantons and municipalities

There is no single safe rule of the form:

> "Every Swiss municipality is legally bound to exactly the same WCAG version."

eCH-0059 describes authorities and public bodies at all federal levels as its target domain, but says it applies to those who recognise/adopt the standard as binding.

Concrete cantonal requirements therefore need a jurisdiction profile.

Examples verified in September 2026:

- **Canton Zürich:** WCAG 2.2 AA; also orients itself to eCH-0059 v3.
- **Canton Bern:** websites, web applications, forms, newsletters and electronic documents must meet at least WCAG 2.2 AA; Bern also cites its Digital Administration Act, binding ICT standards and eCH-0059.
- **Canton Basel-Stadt:** states WCAG 2.1 AA + eCH-0059 v3 as cantonal accessibility standards and PDF/UA for generated documents.

Municipal applicability should therefore be resolved through the municipality's canton and, where necessary, municipal rules or procurement/ICT standards.

---

## 2. Authority classes

Every source gets an explicit authority class.

```text
LAW
    Constitution, statute, ordinance, treaty obligation

BINDING_STANDARD
    Standard or administrative instruction explicitly made binding
    for the target organisation/jurisdiction

ADOPTED_POLICY
    Official cantonal/municipal policy or published requirement

TECHNICAL_STANDARD
    Normative technical specification incorporated by a binding source
    (e.g. WCAG success criterion)

OFFICIAL_GUIDANCE
    Government implementation guidance, checklist or explanatory material

BEST_PRACTICE
    Recognised expert guidance, e.g. Access for All, W3C techniques,
    usability/accessibility practices not themselves binding
```

A source may be authoritative without itself being legally binding.

---

## 3. Requirement strength

Do not use one boolean `required`.

Use:

```text
MANDATORY
    Source uses a binding shall/must requirement for this target.

CONDITIONALLY_MANDATORY
    Requirement applies only under a stated scope/date/content condition.

RECOMMENDED
    Official source says should/recommends.

BEST_PRACTICE
    Useful expert practice without demonstrated binding force.

UNKNOWN
    We have not yet established applicability for this jurisdiction.
```

This is separate from scanner confidence.

---

## 4. Provenance chain

A reportable requirement is a chain of claims.

Example:

```text
Finding:
Input field has no accessible name

TECHNICAL EVIDENCE
axe-core: label / WCAG mapping
        ↓
TECHNICAL REQUIREMENT
WCAG 2.1 SC 4.1.2, Level A
        ↓
INCORPORPORATING STANDARD
eCH-0059 v3 requires WCAG 2.1 AA
        ↓
JURISDICTIONAL AUTHORITY
Federal Administration:
EBGB says eCH-0059 v3 is binding
        ↓
REPORT WORDING
"Does not meet a requirement applicable to Federal Administration
websites under eCH-0059 v3 / WCAG 2.1 AA."
```

For a Zürich target the upper part changes:

```text
WCAG 2.2 criterion
        ↓
Kanton Zürich official accessibility requirements:
WCAG 2.2 AA
        ↓
target applicability
        ↓
report wording
```

The scanner finding can therefore stay the same while the **reason it is required** changes by jurisdiction.

---

## 5. Source data model

Suggested source record:

```yaml
id: ch.zh.web-accessibility.requirements
title: Vorgaben zur Barrierefreiheit
issuer: Kanton Zürich
jurisdiction: CH-ZH
authority_class: ADOPTED_POLICY
source_url: https://www.zh.ch/...
retrieved_at: 2026-09-25
effective_from: null
effective_to: null
status: current

assertions:
  - id: wcag-22-aa
    strength: MANDATORY
    applies_to:
      - cantonal_websites
      - cantonal_webapps
    requirement:
      standard: WCAG
      version: "2.2"
      level: AA
    evidence:
      quote_or_locator: "Unsere Vorgaben richten sich nach ... WCAG 2.2 ... AA"
```

Do not store only URLs. Store the assertion we believe the source supports.

---

## 6. Requirement data model

```yaml
id: req.wcag.2_2.1_1_1
title: Non-text Content

technical:
  framework: WCAG
  version: "2.2"
  success_criterion: "1.1.1"
  level: A

applicability:
  profile_refs:
    - ch.zh.public-web
    - ch.be.public-web

provenance:
  - source_ref: w3c.wcag22
    relation: DEFINES
  - source_ref: ch.zh.web-accessibility.requirements
    relation: INCORPORATES
    strength: MANDATORY

automation:
  coverage: PARTIAL
  engines:
    - axe-core
  manual_review_possible: true
```

---

## 7. Jurisdiction profiles

The report engine should resolve findings against a versioned profile.

```text
requirements/profiles/
  ch.federal.yml
  ch.zh.yml
  ch.be.yml
  ch.bs.yml
  ...
```

Example:

```yaml
id: ch.zh.public-web
jurisdiction: CH-ZH
as_of: 2026-09-25

targets:
  cantonal_websites:
    wcag:
      version: "2.2"
      level: AA
      strength: MANDATORY

  municipal_websites:
    status: NEEDS_JURISDICTION_RESEARCH
```

This last distinction is important: a canton's own website requirement is not automatically proof that every municipality in that canton is bound by the identical internal ICT rule.

Research municipality applicability separately.

---

## 8. Report wording

### Bad

> ❌ Illegal: missing form label.

We generally do not have enough basis for that statement.

### Better

> **Missing accessible label**  
> This does not meet WCAG 2.2 success criterion 4.1.2.  
> For this target, WCAG 2.2 AA is required by the Kanton Zürich accessibility requirements.

Then expose:

```text
WHY THIS IS A REQUIREMENT
─────────────────────────
Kanton Zürich requirement
    ↓ incorporates
WCAG 2.2 AA
    ↓ criterion
4.1.2 Name, Role, Value
    ↓ evidence
<input id="email">
No accessible name detected

Source →      Evidence →
```

### If applicability is uncertain

Say:

> This is a WCAG 2.2 AA issue and recognised accessibility practice.  
> We have not yet established a binding municipal requirement for this jurisdiction.

Never upgrade uncertainty to "mandatory."

---

## 9. Normative vs informative content

This distinction matters at every source layer.

### eCH-0059 examples

Normative:

- WCAG 2.1 AA for websites/mobile applications;
- accessible published documents;
- accessibility statement;
- feedback mechanism;
- alternative communication obligations for defined central information areas.

Recommended / informative examples include some implementation choices, such as PDF/UA being recommended by eCH-0059 for PDFs.

### WCAG

WCAG success criteria and conformance requirements are normative.

Techniques, Understanding documents, examples and much explanatory material are informative.

A scanner may use an informative technique to detect a likely problem, but should cite the normative success criterion as the technical requirement when justified.

---

## 10. Access for All

The Stiftung "Zugang für alle" is a valuable Swiss expert source and appears in official Swiss accessibility material.

Use it primarily for:

- testing methodology;
- practical interpretation;
- implementation guidance;
- audit/checklist practice;
- Swiss accessibility context.

Unless a binding authority explicitly incorporates a particular Access for All rule, classify it as:

```text
OFFICIAL_GUIDANCE or BEST_PRACTICE
```

depending on the document/context, **not LAW**.

This gives the project something useful:

> "Why should we fix this?"

can have more than one answer:

```text
Required because ...
Recommended because ...
Best practice because ...
User impact ...
```

---

## 11. Source precedence

When sources differ:

1. target-specific current law/regulation;
2. target-specific binding administrative standard;
3. target-specific official policy;
4. incorporated technical standard;
5. national general standard;
6. official guidance;
7. best practice.

Newer is not automatically more binding.

Example:

WCAG 2.2 is the current W3C recommendation and W3C recommends using it, but a federal requirement explicitly referencing WCAG 2.1 must still be represented as WCAG 2.1 unless the incorporating Swiss source has changed.

It is reasonable to run additional WCAG 2.2 probes as a **best-practice/future-facing profile**, but the report must not mislabel those additional criteria as federal mandatory requirements.

---

## 12. Scanner profiles: baseline + current practice

This suggests two simultaneous profiles:

### LEGAL / ADOPTED BASELINE

Only findings demonstrated to be required for the target.

Example federal target:

```text
eCH-0059 v3
→ WCAG 2.1 AA
```

### CURRENT BEST PRACTICE

Additional current accessibility checks, for example WCAG 2.2 AA criteria.

Output can then say:

```text
REQUIRED                7 findings
CURRENT BEST PRACTICE   2 additional findings
NEEDS HUMAN REVIEW      3 observations
```

That is much more honest than one undifferentiated red list.

---

## 13. Provenance is versioned evidence

Every benchmark run must pin:

- jurisdiction profile version;
- source registry version;
- source retrieval/effective dates;
- WCAG version;
- eCH version;
- probe engine/version.

If a canton moves from WCAG 2.1 to 2.2 between benchmark runs, WATCH must be able to distinguish:

```text
SITE_REGRESSION
SITE_IMPROVEMENT
REQUIREMENT_CHANGED
PROBE_CHANGED
NOT_COMPARABLE
```

A new legal/standard requirement is not a website regression.

---

## 14. Research backlog

Before nationwide municipality claims, build a canton-by-canton applicability matrix:

```text
Canton
├── cantonal constitution / disability law
├── digital-government law
├── accessibility regulation
├── binding ICT/web standards
├── adopted WCAG/eCH version
├── scope: canton only / communes too?
├── document/PDF requirements
├── accessibility statement requirement
├── feedback mechanism
└── Easy Language / sign-language rules
```

The key question for each canton is not merely:

> "What accessibility standard does the canton use?"

but:

> **"Which source makes which requirement applicable to which public body, including municipalities?"**

---

## 15. Product principle

**Never show a red finding without being able to show its lineage.**

The user should be able to expand:

```text
Finding
→ observed evidence
→ technical criterion
→ incorporated standard
→ jurisdictional source
→ requirement strength
→ source document
```

That chain is part of the product, not legal footnote text.
