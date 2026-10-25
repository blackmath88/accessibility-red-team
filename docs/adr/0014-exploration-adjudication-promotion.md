# ADR-0014 — Exploration, adjudication and reusable probe promotion

Date: 2026-10-25
Status: Proposed — owner-requested direction, reconciled with sparring feedback
Refines: ADR-0011 and catalogue decision D4
Related: ADR-0012 and ADR-0013 remain unchanged
Source: owner-supplied architecture package and accompanying sparring, 2026-10-25.
Reconciled base: main e7e0fc9f2d3319c271fdca9208cdd9cc0c5feb39 (includes frontier PR #45).

## Why this is ADR-0014

The supplied package calls this ADR-0013, but that number already identifies the experimental adaptive track.
Its baseline 088b0f8 predates merged experiments and frontier implementation. We retain their history and reuse
the shipped work. This proposal does not declare itself accepted or claim that proposed behavior is implemented.

## Three distinct questions

1. Discovery: what might be wrong? Agents, AT users, reviewers, anomaly signals and feedback produce hypotheses.
2. Detection: is a specified known condition present? Versioned probes produce immutable assessment results.
3. Adjudication: does that observation constitute a barrier in its context? Reviewed evidence supports findings.

Models are bounded semantic capabilities. Software owns scope, budgets, commands, state and publication policy.
A machine-maintained ledger makes unfinished work persistent and completion auditable; its effect on testing
quality remains to be measured.

## Evidence and publication paths

Automated path: hypothesis -> reproduced observation -> candidate probe -> bounded validation -> trusted probe
-> assessment result -> publication policy.

Human path: hypothesis -> reproduced observation -> human adjudication -> reviewed finding.
A useful barrier does not need to become automatable to become a reviewed finding. Raw model claims are never
publication authority. Automatic population reports include only eligible trusted automated results; manual or
assisted findings require recorded reviewer approval for the specific claim and evidence before publication.
This is a proposed policy to implement and test, not a claim about current report enforcement.

Finding assessment fields: assessment_mode automated/manual/assisted; verification unreviewed/replay_verified/
human_adjudicated; publication_eligibility internal_only/reviewer_approved/automatic. These are independent
dimensions, not interchangeable progress states. Record reviewer identity, evidence version, decision and time.

## Entities and authority

- Property: stable organisation/origin/profile record. Scan jobs, report versions, exploration sessions and
  outreach events have separate lifecycles; no single linear property status.
- Hypothesis: suspected observable barrier, affected task/constraint, falsifying test, source, evidence and replay.
- ProbeExecution/AssessmentResult: immutable execution configuration, upstream rule identity/version, applicability,
  outcome and evidence; preserve violation/incomplete/pass/inapplicable.
- FindingCase: longitudinal issue linked to results and adjudications. Not retested/unobserved is not resolved.
  Resolution needs a comparable relevant retest; sampling omissions cannot resolve a case.
- Frontier obligation: execution_status, assessment_outcome and follow_up_required are separate.
  Scheduling, exclusions and review are validated commands; execution claims require recorded tool events.
- Evidence: integrity-checked artifacts with restricted originals and linked redacted derivatives.
  Hashes do not enforce immutability. Specify access, retention/deletion and consent before human recordings.

State changes occur only through validated authorised commands or recorded execution events, never free-form
model prose. Shared fingerprints prioritize investigation but do not prove behavioral equivalence.

## Catalogue and promotion

Start with one typed TypeScript registry entry wrapping an existing skip-link check. No YAML loader, plugin
interface or broad migration yet. Keep existing implementations and identifiers; axe wrappers retain per-rule
IDs, versions, options and outcomes. A journey observation does not become a standards violation by moving files.

Each entry declares applicability, assumptions, limitations, environment dependencies, precise claim template,
outcome/abstention semantics, required evidence, upstream references, version, maturity and validation record.
Challenge cases include violating, clean, inapplicable and ambiguous inputs.

Fresh-context reproduction is required. One property plus a fixture supports reproducibility/candidate status,
not universal generalisability. Trusted promotion requires a documented intended deployment scope, independent
challenge cases, false-positive and false-negative assessment, applicability/abstention results and human review.
Maturity: experimental -> candidate (internal shadow results) -> trusted (eligible for policy) -> retired.
No automatic promotion. Preserve manual barriers and abandoned promotions as useful research outcomes.

## Architecture and storage

Reuse TypeScript, Playwright, Zod, containment, persisted frontier, traces, deterministic probes and adapters.
Keep exploration isolated from production. Git owns reviewed probe knowledge; R2 holds evidence; D1 supports
records and analytics. Do not introduce Durable Objects in this slice.

A later actor requires demonstrated coordination/recovery needs, not merely a lifecycle. Session reservations,
cancellation and late-result fencing may be a stronger first candidate than HypothesisDO. Use command IDs,
generation fencing, idempotent completion and reservation reconciliation. Declare exactly one state authority;
projections must be rebuildable. No claim of exactly-once dispatch or alarm execution.

Schemas bound action shape, not prompt-injection influence. Retain network containment, discovered-target
validation, no-progress/repetition accounting and adversarial fixtures. Do not weaken budgets or safety.

## Immediate delivery

Documentation first, as requested by the package brief. Follow with a separate bounded implementation:
1. Inventory current main and existing frontier/replay functionality; do not rebuild PR #45.
2. Prepare two frozen decision packets: missed sibling and dialog/focus interpretation.
3. Compare original/frontier-visible/restructured packets, current/stronger model, 10 repetitions:
   2 points x 3 variants x 2 models x 10 = 120 single-response calls. This is a proposed paid experiment, not permission.
   Multi-turn finish rejection is separate and counts all requests.
4. Test selected interventions in short fixture continuations. Frozen replies identify candidate interventions,
   not internal model beliefs or end-to-end reliability.
5. Independently exercise exactly one existing probe through a minimal typed registry and review gate.
   This demonstrates the promotion contract, not novel barrier discovery.

Build a no-API mock smoke first. Live execution requires verified credential source, exact models, targets and
currency cap; previous trial authority is not assumed transferable. No public scan, outreach, deployment or merge
is part of this change. No automatic tag push or destructive branch hygiene.

Keep minimal ledger regardless of model-visible frontier effectiveness. Optional frontier presentation is an
intervention; operational UI/DOs are separate. Do not gate accounting correctness on 8/10 action flips.
For wider validation, pre-register held-out paired runs, clean controls and scarcity, separate exploration from
interpretation and compare heuristic scheduling with equal available tools. Keep discovery of new barrier
classes distinct from finding known seeded conditions.

Measure verified useful manual and automated barriers, incremental coverage, false claims, abstention, review
effort, marginal automation cost and promotion yield separately. Do not optimize solely for probe count.
Early AT-user input is valuable but requires consent, compensation arrangements and separate recording policy;
it is not an authorised recruitment task or a humans-versus-model competition.

## Deferred

All DO classes, review UI/theatre expansion, YAML loading, framework rewrite, hybrid routing, runtime Morrow
integration, broad probe migration and automated outreach.

## Acceptance for this direction

A precise, bounded probe claim can be reproduced and challenged without changing existing claim strength;
human-adjudicated non-automatable barriers have an explicit path; old trials remain immutable; paid experiment
and operational migration are separately reviewable. No conformance certification or municipality ranking.
