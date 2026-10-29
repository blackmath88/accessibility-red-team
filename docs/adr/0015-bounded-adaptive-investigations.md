# ADR-0015 — Bounded adaptive investigations

Date: 2026-10-29
Status: Proposed standing architecture; owner-requested Basel experiment scope.
Refines: ADR-0013's experimental action/code boundary for the separate research slice described below.
Keeps: ADR-0012 production separation, ADR-0014 evidence/adjudication distinctions.
Milestone: [Basel Adaptive Investigation Loop](../experiments/BASEL_ADAPTIVE_INVESTIGATION_MILESTONE.md).

## Context

Recorded A/B/C/M experiments showed weak local navigation and unreliable model claims despite successful
Mistral page exploration. They did not test model-designed targeted measurements over collected evidence.
Basel field evidence offers a narrow opportunity: distinguish rendering/overlap explanations for a faint hint
and, later, correct a focus-heuristic false alarm.

The owner explicitly requested testing dynamic discovery/execution/iteration on Basel, with generated
executable experiments inside a guided process. Requiring human code review before every exploratory revision
would exclude the very mechanism under test. Automatic trusted-check promotion is a separate concern.

## Decision for this bounded research slice

1. Software fixes scope, authority, allowed capabilities, resource/time/cost limits and stopping.
2. Agents may generate and revise executable analysis/experiment code within that envelope without human
   approval per iteration. Fresh critic/judge contexts challenge inference, not grant runtime permissions.
3. Generated code executes in a verified isolated route with no ambient secrets, filesystem/process/network
   authority. Browser access is through a narrow validated broker, not raw Playwright/evaluate or shell.
4. Read-only measurements may run on the exact permitted Basel public document after capability isolation
   and public-runner enforcement are tested. Local causal/control experiments use separately labelled fixtures.
5. Every proposal, generated code hash, execution, evidence packet and judgment is versioned and retained.
   A new probe revision is a new recorded attempt inside the same investigation, not a new approval ceremony.
6. Contradicted/inconclusive hypotheses remain first-class results. Conclusions need measurements,
   countertests and fresh-context reproduction; model consensus is not evidence of user impact.
7. Exploratory execution, supported observation, reusable probe trust and external publication remain distinct.
   No dynamic probe receives production/catalogue trust from successful execution or judge approval.
8. The current production scanner and fixture-contained adaptive executor remain unchanged.
   Do not enable the existing experimental public flag or silently rewrite historical ADR-0013 guarantees.
9. Use a separate experimental module boundary, provisionally src/experimental/investigation/, plus focused
   tests and docs; exact files are determined after code inventory. Nothing imports this into production.
10. If enforcement cannot be established, report the missing execution capability; do not substitute
    unrestricted host execution or claim a canned predetermined measurement is dynamic synthesis.

## Non-goals

An agent framework rewrite, arbitrary public crawling, transactions or authentication, self-modifying
production code, sandbox platform development, automatic publication/promotion, government contact or deployment.

## Evaluation

Prove one complete Basel hypothesis → generated executable measurement → challenge/countertest →
adaptive revision where justified → fresh reproduction → synthesis chain.
Measure incremental evidence value, false claims, reproducibility, investigator review effort, time and cost.
Baseline remains the pre-investigation field evidence, not an artificial weak agent.

A useful rejection of the suspected cause counts as research progress; framework completion alone does not.
Broader adoption remains contingent on measured outcomes, not this proposed ADR.
