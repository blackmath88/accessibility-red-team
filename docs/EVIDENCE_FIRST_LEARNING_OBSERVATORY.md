# Evidence-First Learning Observatory — abstraction and related work

Status: architecture/research note. This is not a claim that the full abstraction is implemented.

## Abstraction

The Accessibility Red-Team Observatory is one instance of a broader pattern:

> **Evidence-First Learning Observatory (EFLO): a governed system that observes a domain broadly, spends open-ended intelligence selectively, validates discoveries, and progressively compiles recurring knowledge into cheaper repeatable capability.**

```
SENSE
bounded observations
    ↓
MODEL
subjects + relationships + fingerprints + uncertainty
    ↓
SELECT
highest-information investigations
    ↓
INVESTIGATE
frontier / human / domain tools
    ↓
VALIDATE
reproducible evidence + labels
    ↓
COMPILE
deterministic probe
    OR typed local semantic decision
    OR retain open investigation
    ↓
REDEPLOY
apply broadly + measure generalization
    ↺
```

A useful success criterion is:

> **The system should become less agentic as it learns.**

That does not mean every problem must become deterministic. It means understood structure should migrate downward when evidence supports the move:

```
frontier + human
      ↓ compile
bounded local semantics
      ↓ compile
deterministic code
```

The irreducibly uncertain remainder stays visible rather than being disguised as certainty.

## Stable cross-domain primitives

- **Evidence** — immutable/traceable observations with provenance.
- **Subject** — website, device, service, repository, organization, workflow, corpus, etc.
- **Fingerprint** — evidence-backed signals useful for grouping/selection; similarity is not identity.
- **Scope / authority** — what may be observed or changed and under which techniques.
- **Mission** — bounded investigation with acceptance/exclusions.
- **Finding** — claim pinned to evidence/method/uncertainty.
- **Investigation trace** — observations, actions, evidence, hypotheses and result.
- **Compiler candidate** — a validated recurring pattern proposed for lowering.
- **Capability** — versioned probe/classifier/investigation procedure with cost, risk, uncertainty and provenance.
- **Evaluation** — held-out evidence determining whether lowering/generalization is justified.
- **Deoptimization / escalation** — when a compiled capability's guards fail, return the case upward rather than guess.

## Domain pack

The generic loop can be specialized through a domain pack:

```
domain/
  subject.schema
  evidence.schema
  fingerprints/
  authority.policy
  missions/
  probes/
  semantic-decisions/
  findings.schema
  benchmarks/
  escalation.policy
```

The domain pack does not grant itself authority. It defines the language and tests of a domain.

### Accessibility instance

Subject: public digital property.

Broad evidence: crawl/surfaces, axe/static probes, behavioral journeys, screenshots, coverage, system fingerprints.

Deep mission: can a user under constraint X accomplish civic goal Y?

Compilation targets:
- Playwright/deterministic accessibility probe;
- component/vendor-family detector;
- bounded Morrow semantic classifier;
- retained frontier/human investigation.

### Defensive-security sibling

Subject: device/service/public system.

Default public-target posture: passive/public-surface and non-invasive verification only.

Deep active verification requires explicit target authorization and a separate execution policy.

Compilation target is a safe defensive detector over authorized/public evidence, not an exploit replay.

## Related open-source work

The pieces of EFLO exist in several adjacent lines of work. None of the projects below should be described as implementing EFLO as defined here.

### AgentJIT — closest compilation analogy

Repository: https://github.com/agent-jit/AgentJIT

AgentJIT observes agent execution traces, detects recurring multi-step tool-use patterns, parameterizes them and compiles them into deterministic skills. Compiled paths have guards; a guard failure can fall back to the LLM.

**Steal conceptually:**
- hot-path detection;
- parameterization;
- explicit compiled-hit/bailout metrics;
- deoptimization as a first-class operation;
- ROI/cost accounting for compilation.

**Difference:** AgentJIT compiles repeated *agent trajectories*. EFLO aims to compile validated *domain knowledge discovered through evidence and investigations*, including cases that were not initially repeated agent workflows.

### autocompile — trace mining + holdout validation

Repository: https://github.com/mirkokiefer/autocompile

autocompile mines patterns from traces using Answer Set Programming, benchmarks the compiled result against holdout traces, and emits deterministic programs/job specs.

**Steal conceptually:**
- compilation as a measurable transformation;
- holdout validation before promotion;
- strength reduction: replace expensive operations with cheaper equivalents only when benchmarks support equivalence;
- domain-generic trace representation.

**Difference:** EFLO's input includes observations, fingerprints, findings, human labels and investigation traces, not only workflow traces.

### ReaComp — reasoning traces → symbolic solver

Repository: https://github.com/cmu-llab/ReaComp

ReaComp has a coding agent read LLM reasoning traces and induce a reusable symbolic solver that can execute without per-task LLM calls, with fallback/ensembling for cases the solver does not cover.

**Steal conceptually:**
- teacher reasoning as compiler input;
- symbolic solver as a lower-cost learned artifact;
- evaluate compiled capability independently of the teacher;
- retain fallback rather than force symbolic coverage.

**Difference:** ReaComp targets program-synthesis benchmarks; EFLO generalizes the lowering idea to domain investigations and evidence-backed operational probes.

### DSPy — compile LM programs against metrics

Repository: https://github.com/stanfordnlp/dspy

DSPy treats prompts, demonstrations and model weights as optimizable program parameters. Optimizers compile an LM program against a metric and data; newer work can also search program structure.

**Steal conceptually:**
- explicit metric is required for optimization;
- teacher/student bootstrapping;
- compile against train/validation evidence rather than intuition;
- local/smaller models can be optimized from stronger teachers.

**Difference:** DSPy generally compiles *LM programs into better LM programs/weights*. EFLO also lowers capabilities out of the LM layer entirely into deterministic probes when possible.

### Agent Distillation — frontier/teacher → smaller agent

Repository: https://github.com/Nardien/agent-distillation

This work logs trajectories from a stronger teacher agent, trains a smaller model to reproduce agentic behavior, and benchmarks the student.

**Steal conceptually:**
- frontier-generated trajectories as training evidence;
- explicit student evaluation;
- smaller/local model as a deployment target.

**Difference:** model distillation corresponds to only the middle rung of EFLO. EFLO also asks whether the learned behavior can be lowered further into typed decisions or deterministic code.

### AgentProvenance / Evidence Suite / AERF — evidence and audit substrate

Repositories:
- https://github.com/ByteYellow/AgentProvenance
- https://github.com/cmangun/agentic-evidence
- https://github.com/aerf-spec/aerf

These projects focus on verifiable execution evidence, receipts, provenance graphs and audit/replay.

**Steal conceptually:**
- evidence is a first-class artifact;
- content-addressed/hash-verifiable lineage;
- observed runtime facts should not be overwritten by model assertions;
- external evaluators can consume evidence without becoming the evidence authority.

**Difference:** these systems primarily make execution verifiable. EFLO uses evidence as the substrate for *capability learning and compilation*.

### AgentSpecGap / CompileAgent — compile semantics/policy into enforcement/execution

Repositories:
- https://github.com/aregmii/agentspecgap
- https://github.com/yuer-dsl/compileagent

AgentSpecGap extracts checkable rules from agent artifacts into a policy IR and enforces them before tool calls. CompileAgent proposes Route → IR → deterministic executor.

**Steal conceptually:**
- explicit intermediate representation;
- classify what can/cannot be checked deterministically;
- compiled artifact should be inspectable/auditable;
- enforcement/execution belongs outside probabilistic generation.

**Difference:** EFLO learns candidates from domain evidence and validated investigations rather than primarily compiling pre-existing agent plans/policies.

## Synthesis

The open-source landscape suggests four mature-ish ideas that EFLO combines:

```
PROVENANCE
What actually happened?
    +
ACTIVE / SELECTIVE LEARNING
What should we investigate next?
    +
DISTILLATION
Can a smaller/local model reproduce the useful judgment?
    +
TRACE / PROGRAM COMPILATION
Can we eliminate the model call entirely?
```

The distinctive architectural claim is the **promotion/lowering ladder with evidence and authority preserved across it**.

A capability should carry lineage:

```
observations
→ selected investigation
→ frontier/human trace
→ validated finding
→ compiler candidate
→ implementation
→ held-out evaluation
→ promoted capability
→ production observations
→ regress / deopt / improve
```

## Proposed capability lifecycle

1. **NOVEL** — frontier/human investigation only.
2. **CANDIDATE** — recurring pattern with evidence.
3. **LABELED** — validated examples + counterexamples.
4. **LOCAL_SEMANTIC** — bounded typed Morrow decision passes benchmark.
5. **DETERMINISTIC_CANDIDATE** — explicit rule/probe can reproduce the decision.
6. **DETERMINISTIC** — held-out evaluation passes promotion gate.
7. **REGRESSED** — production evidence violates assumptions; deopt upward.

Not every capability must visit every state.

## Evaluation questions

Before lowering a capability:
- What evidence supports the pattern?
- What are the counterexamples?
- What metric matters?
- What is the held-out set?
- What false-positive/false-negative cost is acceptable?
- What guard determines applicability?
- What happens on guard failure?
- Can the compiled result cite/reproduce its evidence?
- Is the cheaper implementation actually cheaper after operational overhead?
- Has authority changed? (It must not change merely because implementation changed.)

## Relationship to Weavr

```
Observatory observes
→ learning/compiler layer proposes a capability
→ evaluation provides evidence
→ Weavr decides whether promotion/execution is authorized
→ runtime executes
→ new evidence returns
```

A compiler candidate is evidence, not authority.

This preserves:

> Observatory observes → Weavr decides → runtimes act.
