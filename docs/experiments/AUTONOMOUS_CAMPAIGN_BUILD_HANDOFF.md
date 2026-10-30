# Build handoff — autonomous campaign with live milestones

Date: 2026-10-30
Status: owner-agreed operating direction; build a working first slice.
Read with [the pilot plan](BASEL_SCOPE_TO_EVIDENCE_PILOT.md) and [proposed allocations](basel-pilot.proposed.json).
This handoff supersedes any interpretation of the earlier plan that requires approval at each campaign stage.
One launch authorizes in-scope strategy changes, sampling, investigations, bounded revisions and recovery.
New authority or greater resource limits are separate explicit amendments.

## Deliverable

A local Claude-led campaign that runs unattended after launch, reports live progress in the existing control
center, keeps durable logs/checkpoints, and can resume under a larger authorized budget without starting over.

Build preparation and a local/cached rehearsal are the immediate slice. The proposed public manifest remains
disabled until its exact origins/actions and implemented enforcement are resolved for one launch.
No additional per-stage approval flow. No merge, deployment, outreach or public report under this build handoff.

## Minimal implementation

Use current #58 implementation plus #59 plans; verify heads/instructions and preserve independent work.
Existing TypeScript/Zod, browser tools, sandbox/broker, provider contracts and control-center are the foundation.

Add a thin experimental campaign controller:
- fixed campaign ID and versioned scope/budget configuration;
- deterministic queue and shared reservations;
- compact strategy/evidence packets for real Claude decisions;
- append-only events.jsonl and atomic current-state/checkpoint snapshots;
- existing supported assessment/probe calls;
- one live read adapter for the current investigation workspace.

Do not substitute a fixed scanner queue or canned decisions and call it an autonomous campaign.
The local rehearsal must demonstrate an actual evidence-triggered planning decision and a real bounded
investigation or justified rejection. If Claude routing is unavailable, label simulation/dry run explicitly.

Keep local state in a gitignored campaign folder. Expose only validated projections/artifact IDs through an
existing local route or small dev adapter; no arbitrary filesystem paths, shell access or model controls in the UI.
Refresh by simple polling initially (2–3 seconds); reuse an existing compatible stream only if easier.
A disconnected dashboard must not stop execution. Reconnection reconstructs state; completed runs remain replayable.
No new cloud deployment, database, Python/Pydantic runtime, generic agent SDK or mandatory MCP layer.

## Milestones in the UI

1. Understand scope: sourced public bodies/tasks/platform boundaries and unresolved ownership.
2. Set strategy: representative sample and versioned initial queue.
3. Discover and assess: completed/remaining surfaces and explicit unassessed boundaries.
4. Investigate signals: question, alternatives, probe/version, evidence, revision and outcome.
5. Reproduce and consolidate: fresh replays, control results, reversible grouping.
6. Deliver dossier: short report, screenshot cases, limitations and next actions.

Milestone states: planned, active, complete, partial, blocked. Multiple stages may be active together.
Counts are against the current plan revision, not invented overall completion percentages.
A revised denominator has a visible reason; it cannot silently turn incomplete coverage into success.

Show current tasks/worker heartbeat, last useful decision, request/time/call budgets, paused branches, failures,
supported/rejected/inconclusive cases and next action.
Do not animate fake activity or assert model image inspection merely because screenshots exist.

## Autonomous behaviour

The coordinator plans and adapts inside the fixed envelope. The scheduler owns admission/limits/settlement.
Interesting evidence can enqueue an investigation while independent approved work continues.
Prefer cached evidence, representative templates and high-value uncertainties to exhaustive scanning.
Use one revision then explicit model escalation or an inconclusive outcome.
No child task receives a new budget; all work shares the campaign account.

- Ordinary page/probe/model error: bounded recovery, record failure, skip/pause affected branch and continue.
- Rate limit: honour backoff; pause that host while other admitted work continues.
- Newly found external service: map its boundary; do not assess an unadmitted origin.
- Scope/isolation/accounting failure: fence affected execution; abort campaign if containment is uncertain.
- Budget/deadline reached: settle workers, save partial dossier and checkpoint; state = budget_exhausted.
- Adequate representative coverage and resolved/inconclusive priority questions: finish successfully.
- No admissible useful work: finish partial with reasons rather than loop indefinitely.

A budget pause is resumable. An enforcement failure requires a correction and verified recovery, not more budget.

## Expand resources without resetting the campaign

Implement the smallest operator path for status, stop, budget extension and resume; CLI is sufficient first.
Desired operations, not claims about commands already installed:
- start from a validated campaign configuration;
- status/report current progress;
- extend one or more ceilings with a reason;
- resume the same campaign/checkpoint;
- stop and settle active workers.

Append a budget_amended event containing previous/new limits, timestamp and reason.
Never reset consumed usage, overwrite evidence or restart completed measurements on resume.
Validate checkpoint provenance and claim/settle possibly-live work before resuming; do not double-dispatch.
Scope/code/probe changes remain versioned and affect comparability; a resource increase alone cannot broaden actions,
origins, provider permissions or original paid-budget authorization.
Reject lowering a ceiling below consumption. An extension does not imply new hosting or training spend.

## Initial resource settings and honest telemetry

Proposed pilot wall budget: 180 minutes, up to two agent workers.
Initial controller-invocation ceiling for Claude: 24, including worker starts, criticism, conclusions and retries.
This is NOT a claim to cap every internal model turn made by Claude Code.
Reserve 20% of model-call capacity for verification/reporting; stop opening investigations at the soft threshold.
If model capacity is exhausted, render a deterministic partial report from stored facts.

Proposed token TARGET: 500,000 input / 60,000 output for the campaign.
Previous range estimate (200k–700k input / 20k–60k output) is an unmeasured planning estimate, not a benchmark.
A small preflight must discover the real CLI version, actual usage fields, cache semantics and supported output controls.
Do not invent CLI flags or treat a prompt's “max tokens” sentence as enforcement.

Record measured token use separately from estimates/reservations; include cached input categories where available.
Count coordinator/worker/retry/review usage without double-counting cumulative session totals.
When token telemetry is missing, show unknown and rely on enforced invocation/time/concurrency limits.
A hard aggregate token ceiling may be claimed only with trusted usage and conservative per-call reservations,
including in-flight concurrent calls. Otherwise label tokens a target, not a hard limit.
Requested output ceiling 4,000 tokens per invocation only where the installed route supports enforcement.
Do not weaken necessary evidence to meet a small packet cap; compact per target and disclose omitted material.

Claude subscription usage is not API dollar spend or known remaining allowance. Use actual eligible CLI sessions.
No new paid Claude/Apertus route. Verify and preserve the original Mistral USD 5 aggregate ledger if used;
last reported amount USD 0.1042252 is a reference, not a new allowance.
Apertus remains a later evaluated role and cannot block getting this campaign working.

## Logs

Operational events: task/request starts and settlement, backoff, reservations/usage, errors, artifact hashes.
Decision events: selected/skipped work, evidence references, concise reason, strategy revision and outcome.
Record facts and concise rationales, not private chain-of-thought or credentials.
Stable event IDs, campaign/task/investigation IDs, timestamps and versions permit deduplication/replay.
Preserve original outputs and failed attempts; sanitize provider errors and keep bulky/private artifacts out of git.

## First build and rehearsal — 90 minutes

1. Inspect current implementation; keep broker changes to prerequisites actually needed.
2. Build controller state/checkpoint/events and resource-extension path.
3. Connect the existing UI to real local campaign state with the six milestones.
4. Run a local/cached rehearsal showing a strategy decision, baseline, investigation, replay and report.
5. Deliberately exhaust a tiny budget, then extend/resume: prove usage persists and finished work is not repeated.
6. Test UI reconnect/API failure, desktop/mobile, keyboard, and actual heartbeat/unknown telemetry states.
7. Focused independent exact-code review where available; relevant tests/build and a coherent draft PR.

Acceptance: one command launches the local campaign; live milestones and decisions reflect real work;
failure recovery and extend/resume work; final/partial report and durable evidence survive UI disconnection.
Readiness for a public Basel launch is explicit. No further platform build is a prerequisite.
