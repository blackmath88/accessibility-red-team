# Accessibility Red-Team Observatory — learning architecture

Status: concept direction, not current production behavior.

## Thesis

The Observatory should not become a larger accessibility scanner with an LLM attached.

It should become a learning red-team system:

```
population-scale reconnaissance
        ↓
system / implementation fingerprinting
        ↓
signals, ambiguity and interesting surfaces
        ↓
bounded adaptive red-team missions
        ↓
validated discoveries
        ↓
compile what is repeatable
        ↓
deterministic probe OR bounded local semantic decision
        ↓
back into population-scale reconnaissance
```

The objective is to continuously move understood work **down the cost/uncertainty ladder**:

```
frontier exploration → bounded local semantics → deterministic software
```

Human review remains the authority for consequential or unresolved judgments.

## Layer 1 — Observatory / reconnaissance

Run broadly and cheaply.

Inputs:
- canonical public digital properties;
- jurisdiction/profile;
- safe crawl bounds.

Outputs:
- deterministic accessibility evidence;
- surfaces and journeys;
- coverage and uncertainty;
- system fingerprints;
- recurring patterns;
- anomaly signals.

This layer should scale to hundreds/thousands of properties without frontier-model calls.

## Layer 1.5 — System fingerprinting

Accessibility failures are often properties of shared implementations rather than unique municipal content.

Capture implementation metadata so the Observatory can ask:
- Which municipalities share a CMS/vendor?
- Which share a design system or component family?
- Which share a forms/e-government/document service?
- Which third-party widgets recur?
- Do failure signatures cluster by implementation family?
- Can one deep investigation yield a targeted probe for many properties?

### Fingerprint dimensions

Examples, not an exhaustive schema:
- CMS/product family and version signal where safely observable;
- hosting/CDN/platform;
- frontend framework;
- design-system/component signatures;
- municipal website vendor/agency signals;
- form/e-government provider;
- search provider;
- cookie/consent tooling;
- document/PDF viewer;
- map/GIS widget;
- identity/login provider;
- embedded third-party services;
- common asset/script origins;
- HTTP/security/platform metadata useful for grouping, without treating it as vulnerability evidence.

### Evidence discipline

Use the Xinx-style distinction:

- **OBSERVED** — directly present in response headers, HTML, scripts, assets, manifests or public metadata.
- **INFERRED** — deterministic fingerprint/rule suggests a product/family.
- **ENRICHED** — supported by an external authoritative/public source.

Every fingerprint should carry:
- value;
- confidence;
- evidence references;
- method/rule version;
- observedAt;
- provenance class.

Never silently promote an inference into fact.

## Layer 2 — targeted accessibility red-team missions

The deeper unit is not “run another rule.” It is:

> Can a user under accessibility constraint X accomplish civic goal Y?

Candidate missions:
- complete navigation using keyboard only;
- recover from form validation without visual-only feedback;
- locate and understand a municipal service at high zoom;
- discover required documents without relying on visual layout;
- operate expandable/navigation controls with focus continuity;
- retrieve important civic information through semantic structure;
- identify whether a third-party service breaks an otherwise accessible journey.

Missions must remain bounded public-user interactions. No destructive submissions, account takeover, authentication bypass, denial-of-service/load behavior, or actions outside the approved public surface.

### Target selection

Do not deep-test everything.

Prioritize:
- recurring deterministic ambiguities;
- unusual failure signatures;
- high-impact civic journeys;
- representative members of a shared implementation family;
- outliers within an otherwise consistent family;
- third-party components appearing across many properties.

A whole-canton reconnaissance run may therefore reduce 100+ municipalities into a much smaller set of representative deep investigations.

## Layer 3 — compile discoveries

After frontier/human investigation, ask:

> What can we compile away?

A discovery can become:

### A. Deterministic probe
Use when the condition and reproduction are sufficiently specifiable.

### B. Bounded local semantic decision
Use when meaning/context is required but the legal decision space can be made small and typed.

This is Morrow's preferred role.

Example:
```
evidence packet
    ↓
legal outcomes:
  actionable
  needs_context
  likely_false_positive
  human_required
    ↓
Morrow chooses + cites supplied evidence
```

### C. Frontier/human investigation
Retain when the problem is genuinely novel/open-ended or the consequences of error remain too high.

The desired long-term direction is that C shrinks as A/B grow.

## Frontier-model role

Frontier models are research instruments for discovering/testing the ontology, not an always-on production dependency.

For selected missions they may receive:
- frozen deterministic evidence;
- screenshots;
- bounded DOM/accessibility representations;
- surface/journey context;
- known probe catalogue;
- explicit user constraint and civic goal;
- tightly bounded browser tools.

Produce structured traces:
```
mission
observations
actions
barrier
evidence
hypothesis
reproduction
classification
remediation guidance
```

Novel patterns require human validation before becoming doctrine.

## Morrow role

Morrow is local, governed semantic compute on Nebuchadnezzar.

It should not rewrite deterministic evidence or independently declare conformance.

Potential responsibilities:
- typed semantic triage proven useful by evaluation;
- clustering/label assistance over frozen evidence;
- bounded mission decisions learned from frontier/human investigations;
- local analysis where evidence should not be sent to an external frontier model.

Every Morrow artifact records:
- input evidence hashes;
- model/model revision;
- prompt/schema version;
- allowed outcomes;
- chosen outcome;
- cited evidence;
- confidence/uncertainty;
- timestamp;
- AI call count.

## Learning loop

```
OBSERVE
population evidence + fingerprints
       ↓
SELECT
representative/anomalous/high-value targets
       ↓
EXPLORE
frontier + bounded tools
       ↓
VALIDATE
human / reproducible evidence
       ↓
COMPILE
deterministic probe or typed local decision
       ↓
DEPLOY
new capability into Observatory
       ↓
MEASURE
does it generalize across the population?
       ↺
```

This is a semantic-compiler architecture: use probabilistic intelligence where determinism cannot yet carry the task, then progressively constrain and compile learned structure.

## Research questions for the Solothurn population run

Use the current canton corpus to learn:
1. Which implementation/vendor/CMS families exist?
2. How concentrated are municipalities across those families?
3. Which findings cluster by implementation family?
4. Which findings remain municipality/content-specific?
5. Which behavioral failures recur across a shared component?
6. Which sites are useful representatives for deep missions?
7. Which outliers deserve frontier investigation?
8. Which unresolved findings are text-semantic vs visual/behavioral/tooling limitations?
9. What can be turned into a new deterministic probe?
10. What genuinely remains suitable for Morrow?

Do not rank municipalities. The object of study is the ecosystem, implementations, barriers and testing capability.
