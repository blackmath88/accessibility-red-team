# Pilot v1 — Zürich + Solothurn

## Research question

Can an evidence-first accessibility observatory produce accurate, reproducible and actionable accessibility evidence across heterogeneous Swiss municipal digital services while clearly separating deterministic observation, behavioral evidence, bounded semantic interpretation and remaining human judgment?

Secondary question: what useful evidence does the observatory add beyond a conventional root-page axe baseline?

## Why Zürich + Solothurn

The pilot deliberately compares two different municipal digital ecosystems rather than treating municipalities as interchangeable websites.

- Zürich: large and heterogeneous municipal landscape; mature canton–municipality digital-government collaboration; useful variation from major cities to small rural municipalities.
- Solothurn: smaller municipal ecosystem with regional centres, rural municipalities and shared digital-service rollout.

This is a system-evaluation pilot, not a ranking of cantons or municipalities.

## Phases

### Phase 0 — engineering validation

Use the existing Basel-region + Zürich eight-site cohort to falsify scanner assumptions and harden the observatory.

### Phase 1 — research pilot

24 municipalities:
- 12 Zürich
- 12 Solothurn

Stratify within each canton by:
- large urban/regional centre;
- suburban/agglomeration;
- medium municipality;
- small/rural municipality;
- unusual/complex case.

Before freezing the sample, record website technology/provider where observable. Avoid accidentally studying one municipal CMS vendor.

### Phase 2 — replication

40–60 additional municipalities selected with the same rules.

### Phase 3 — population observatory

Expand to all municipalities in Zürich and Solothurn only after the method has earned that scale.

## Comparable civic surfaces

Do not evaluate only homepages. SCOUT should attempt to identify comparable civic-service archetypes:

1. homepage;
2. administration/contact;
3. political participation / voting;
4. form or transaction;
5. document-heavy information;
6. search;
7. news/current information;
8. building/planning, moving/residence, fees/tax, school/family where present.

Missing archetypes are evidence about coverage, not failures.

## Evaluation arms

Every sampled site/surface is evaluated through the same captured evidence.

### Arm A — baseline

Default axe on the baseline/root surface.

### Arm B — deterministic observatory

SCOUT + deterministic probes + provenance + safe behavioral journeys + evidence normalization. No LLM.

### Arm C — deterministic + Morrow

Arm B evidence is passed to a bounded local semantic-decider experiment on Nebuchadnezzar.

Morrow MUST NOT:
- discover new URLs;
- execute browser actions;
- alter deterministic outcomes;
- invent WCAG applicability;
- promote a finding to conformance/violation;
- see the human-validation label before producing its decision.

Morrow MAY:
- classify a predeclared ambiguity;
- select from a typed decision space;
- provide a short rationale tied to supplied evidence;
- return REQUIRES_HUMAN_REVIEW.

## Paired comparison

Arms B and C use identical deterministic evidence. This allows us to ask whether local semantic interpretation changes:

- confirmation rate;
- false-positive rate;
- uncertain rate;
- actionability;
- human-review burden;
- explanation usefulness.

Do not compare prose length or fluency as a success metric.

## Human validation

Sample findings across:
- static violations;
- incomplete evidence;
- behavioral results;
- Morrow decisions;
- apparently clean sites.

Labels:
- confirmed;
- false_positive;
- uncertain;
- duplicate.

Actionability:
- actionable;
- needs_context;
- not_actionable.

## Reporting

Report method performance and recurring patterns. Never publish a municipality accessibility score or league table.

An ecosystem-level result may be more useful than organization-level outreach: recurring problems should be clustered by component, technology or provider where evidence supports it.
