# Evidence-First Learning Observatory — prior art and abstraction

Status: research note. This is architectural positioning, not a claim that every cited project implements this system.

## Finding

There is strong open-source prior art for almost every primitive in the proposed learning architecture, but no single reviewed project found in this survey combines all of the following as one governed loop:

1. population-scale evidence collection;
2. provenance-first subject/system fingerprinting;
3. information-value target selection;
4. bounded frontier/human investigation of unresolved cases;
5. validation against retained evidence;
6. compilation of discoveries downward into either deterministic probes or constrained local semantic decisions;
7. capability lineage and redeployment across the population;
8. explicit separation of observation, learned capability, authority and execution.

The useful abstraction is therefore not “a new scanner.” It is an orchestration/learning pattern that composes established ideas.

## Closest prior art

### ProjectDiscovery Nuclei + nuclei-templates

Repositories:
- https://github.com/projectdiscovery/nuclei
- https://github.com/projectdiscovery/nuclei-templates

Why it matters:
- template-driven repeatable checks;
- large community capability catalogue;
- workflows and targeted template execution;
- automatic scan mode maps Wappalyzer technology detection to relevant template tags;
- research can be encoded as reusable deterministic templates.

This is the closest precedent for:

```
fingerprint → choose relevant capability → execute repeatably
```

and for the idea that expert discoveries become reusable machine-executable checks.

Difference:
Nuclei is primarily a scanner/template execution ecosystem. The proposed Observatory adds an explicit evidence/uncertainty model, representative-target selection, frontier/local/human learning tiers, compilation lineage and authority separation.

### Wappalyzer

Representative repository:
- https://github.com/HTTPArchive/wappalyzer

Why it matters:
- technologies are inferred from explicit signatures over HTML, headers, scripts, DOM, cookies, DNS and related evidence;
- signatures can carry confidence and implication relationships.

This is direct prior art for the deterministic part of `system-fingerprint/v1`.

Difference:
Our fingerprint is not merely technology detection. It is a provenance-bearing research object used for grouping, target selection, uncertainty and downstream learning. Similarity never establishes identity.

### Sigma

Repository:
- https://github.com/SigmaHQ/sigma

Why it matters:
Sigma's stated purpose is to let researchers/analysts describe once-developed detection methods in a structured, shareable, vendor-agnostic form.

This strongly validates:

```
human/research discovery
      ↓
structured detection knowledge
      ↓
repeatable machine capability
```

Difference:
Sigma starts after the detection logic is known. Our compiler loop explicitly models how an unresolved observation becomes an investigation, validated pattern and then a candidate compiled capability.

### Semgrep / Semgrep rules

Repositories:
- https://github.com/semgrep/semgrep
- https://github.com/semgrep/semgrep-rules

Why it matters:
- expert patterns become deterministic, versionable rules;
- rules are testable and executable in CI;
- the broader platform also uses AI for contextual post-processing/remediation.

This resembles the desired separation between deterministic detection and higher-cost semantic interpretation.

Difference:
Our architecture makes movement between intelligence tiers a first-class lifecycle with evidence lineage and promotion gates.

### DSPy

Repository:
- https://github.com/stanfordnlp/dspy

Why it matters:
DSPy explicitly uses the language of compiling declarative LM programs. Its optimizers can:
- bootstrap demonstrations;
- optimize instructions;
- use metrics/evaluation;
- use stronger teacher/reflection models;
- optimize smaller/cheaper models for a bounded task.

GEPA is particularly relevant: a stronger reflection LM examines trajectories/results and proposes improvements to a student program, which is evaluated against metrics.

This is the closest prior art for:

```
frontier teacher/research
      ↓
evaluated bounded task
      ↓
cheaper/local semantic program
```

Difference:
DSPy compiles LM programs into better LM programs/prompts/weights. Our stronger claim is **cross-paradigm compilation**: an open semantic investigation may terminate as a local typed classifier *or disappear into deterministic code entirely*.

### Snorkel

Repository:
- https://github.com/snorkel-team/snorkel

Why it matters:
Snorkel treats expert heuristics as programmatic labeling functions, combines imperfect signals, supports abstention, and uses them to create/manage training data.

This supports the idea that domain expertise should be captured as executable structure rather than repeated manual judgment.

Difference:
Our target is an operational evidence/investigation/capability lifecycle rather than primarily training-data generation.

### Detection-as-code / rule compilers

Examples:
- https://github.com/cognis-digital/detectionkit
- broader Sigma ecosystem

Why it matters:
A neutral rule representation can compile deterministically into multiple execution dialects. This is useful precedent for future domain-pack capability IRs.

## The abstraction

The proposed reusable architecture is an **Evidence-First Learning Observatory**:

```
SENSE
bounded evidence
   ↓
MODEL
subjects + relationships + fingerprints + uncertainty
   ↓
SELECT
maximize information value / impact
   ↓
INVESTIGATE
bounded domain mission
   ↓
VALIDATE
reproducible evidence + human/eval
   ↓
COMPILE
   ├─ deterministic capability
   ├─ bounded local semantic capability
   └─ retain frontier/human investigation
   ↓
REDEPLOY
apply broadly
   ↓
MEASURE
generalization, false positives, cost, uncertainty
   ↺
```

## The key distinction

Existing systems frequently implement one transition:

- Wappalyzer: evidence → fingerprint;
- Nuclei: fingerprint/template → targeted deterministic execution;
- Sigma/Semgrep: expert knowledge → reusable deterministic rule;
- Snorkel: heuristics → programmatic labels/training data;
- DSPy: evaluated examples/traces → optimized LM program.

The proposed architecture makes **the transitions themselves** the product/control-plane concern.

A capability has lineage:

```
observation
→ investigation
→ validated finding
→ candidate capability
→ benchmark
→ promotion
→ population execution
→ measured performance
```

That lineage should survive whether the final capability is code, a rule, a state machine, a prompt/program, or a local model decision.

## Intelligence ladder

```
high flexibility / high cost / high uncertainty

human + frontier investigation
          ↓ compile when justified
bounded local semantic decision
          ↓ compile when sufficiently specified
deterministic rule / probe / state machine

low cost / repeatable / auditable
```

The architecture must allow **no compilation** when the evidence does not justify it.

Success is not maximum autonomy. Success is reducing the amount of open-ended reasoning required for recurring work while preserving uncertainty where it remains real.

## Domain-pack hypothesis

A generic observatory/compiler can own:
- evidence ledger and provenance;
- subject registry;
- fingerprints;
- scopes/authority;
- missions and traces;
- target selection;
- capability registry;
- benchmarks/evaluation;
- promotion lineage;
- runtime routing.

A domain pack supplies:
- subject schema;
- sensors/importers;
- fingerprint dimensions;
- authority defaults;
- mission catalogue;
- deterministic probes;
- semantic decision schemas;
- finding/report schemas;
- benchmarks;
- escalation/promotion policy.

Accessibility is the first proving domain. Defensive cybersecurity is a sibling with stricter authority defaults. Repository health, organizational adoption and other evidence-rich domains may fit later, but should only be claimed after concrete domain experiments.

## What to borrow, not rebuild

Near-term accessibility work should reuse ideas rather than recreate ecosystems:

1. **Wappalyzer-style fingerprints** for CMS/framework/vendor signals, wrapped in our OBSERVED/INFERRED/ENRICHED provenance.
2. **Nuclei-style template/workflow thinking** for targeted probe families, without importing unsafe security behavior into accessibility.
3. **Sigma/Semgrep-style rule metadata and tests** for compiled deterministic accessibility probes.
4. **DSPy-style train/validation/test discipline and teacher→student optimization** when evaluating whether Morrow can replace frontier semantic decisions.
5. **Snorkel-style abstention**: a local semantic capability must be allowed to say HUMAN_REQUIRED / ABSTAIN rather than force a label.

## Research implication for Solothurn

The canton run is valuable as a population dataset for this architecture:

```
municipalities
→ implementation fingerprints
→ clusters + outliers
→ representative deep missions
→ validated recurring barriers
→ compiled probes / bounded Morrow decisions
→ rerun across population
```

The next evaluation should measure not just “how many findings,” but how much open-ended work can be safely converted into repeatable capability without losing evidence quality.
