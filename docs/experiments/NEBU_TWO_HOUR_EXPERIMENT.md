# Nebu: two-hour real-model accessibility experiment

Date: 2026-10-27
Inspected main: c8a70f8249ce660a1609ae7a7b9909b8d6785e06.
Owner intent: make a plan and run it, with at least two hours available.
Execution envelope: 120 minutes from the local coordinator start; no new paid API spend.
This is an authorized isolated experiment, not a new Weavr Mission or a production rollout.

## Outcome

Return actual local-model evidence comparing selection with and without visible frontier against the
existing deterministic scheduler. At minimum complete one matched triple on a local fixture.
A truthful partial or negative result is useful. Another mock-only success or more publication infrastructure
does not satisfy the goal.

Read current repository instructions, Observatory, canonical Weavr operating contract, applicable accepted ADRs,
FRONTIER_BENCHMARK.md, DECISION_REPLAY.md and the installed Orca orchestration/routing guide.
Current benchmark CLI has no live path. Do not pretend --live already works.
Reuse existing contained executor, frontier, scheduler, provider boundary and scoring.

## Time and execution bounds

| Time | Deliverable |
|---|---|
| 0–15 minutes | Verify runtime/ownership/model service, choose exact model and record preflight |
| 15–40 | Minimal local provider/runner wiring if needed, focused tests, freeze runnable commit/config |
| 40–100 | Matched real-model sessions and trace analysis; preserve results incrementally |
| 100–120 | Stop launches, settle jobs, analyze results, checks and concise handoff |

These are targets inside one enforcing 120-minute deadline, not promises to wait until each boundary.
Reserve execution time: if runner work is unfinished at minute 40, narrow to one fixture and the minimum
safe adapter rather than expanding infrastructure. Report a genuine blocker if no safe real run is possible.
No new sessions after minute 100. Outer supervisor must stop all owned work and observe settlement by expiry.
Count repairs, retries and model startup in the same envelope. Do not fill unused time after completion.

At most two development workers on disjoint worktrees; coordinator owns integration.
Run benchmark inference sequentially unless observed local capacity supports comparable isolated concurrency.
Do not run coding inference on the benchmark GPU during measured sessions. No recursive delegation.
Use installed Orca APIs/CLI; native non-Orca agents are not Orca workers.
Load the two named user skills when installed; if absent use Orca's actual guide and disclose absence rather
than making isolated development contingent on installing skills.

## Local preflight

Verify actual execution host: Nebuchadnezzar may appear as nzxt. Do not require a remote environment named
Nebu when the coordinator is already on that host. Record hostname and execution/service placement separately.
Inspect active workers/processes and preserve unrelated running jobs.

Discover existing local inference service without printing credential files/environment values.
Record endpoint destination, model identifier/readback, model artifact/quantization when available, context limit,
structured-output support, observed latency and service capacity. Local hosting of Claude is not local inference.
Morrow service reachability and Nebu host reachability are different checks.

Use the currently available suitable local model, not a remembered Qwen label.
One tiny real preflight plus one smoke session: ensure valid action JSON, timeout/cancellation and model identity.
Where a local endpoint supports the existing chat-completions adapter, reuse it without changing the Mistral
default or broadening production imports. Otherwise add one minimal experimental ModelProvider.
Do not send fixture content or requests to a paid/cloud model as fallback.

If no local service is ready, use already installed model/service management only within available resources;
do not download large weights, install infrastructure or switch to paid APIs. Report the exact blocker.

## Experiment protocol

Use three neutral DEVELOPMENT fixtures: dev-k1 (siblings), dev-k2 (mixed checks), dev-k3 (dialogs).
They have already been inspected and are not held-out. Do not claim generalisation.

Three conditions:
- H: local LLM, frontier hidden; candidate persistence and completion accounting enabled.
- V: same local LLM, same tools/prompt/settings, frontier visible; other condition flags identical to H.
- D: existing deterministic FrontierScheduler and existing versioned rule table, zero model calls.

Reuse the existing hidden/B/D condition contracts rather than inventing competing semantics.
Record actual condition objects and enforce homogeneous conditions under each report label.
LLM-versus-scheduler compares complete mechanisms, including interpretation; only H-versus-V isolates visibility.
Do not present D's by-construction completion accounting as proof of superior reasoning.

Target: 3 fixtures × 3 repetitions × 3 conditions = 27 sessions, including 18 real-model sessions.
No stronger-model arm or historical-replay work is needed in this packet.
Initial pilot: one matched triple on dev-k1. Use observed duration to decide whether all 27 fit.
If not, freeze a reduced matrix before the measured run, including the pilot's exposure/configuration provenance.
Complete whole matched blocks, not whichever arm is fastest.
Never silently drop a failed or incomplete session.

Suggested session bounds (reuse stricter existing bounds where applicable):
12 model calls, 24 browser steps, 8 surfaces, 180 seconds, 600 output tokens per ordinary call,
up to existing 1500-token final completion, and at most 30 seconds per model request.
Allow a preregistered slower local request timeout up to 60 seconds only if pilot evidence justifies it and
apply it equally to H and V while retaining outer session/deadline bounds.
Keep existing input/context caps and record truncation; do not truncate silently or inflate budgets after a miss.
Global maximum: 260 local inference requests including preflight, pilot, failed requests and explicit retries.
No implicit retries, provider fallback or runtime prompt tuning inside a frozen segment.

Save immutable configuration/code/prompt/model identity, seeds if supported, exact observations and responses,
denials, evidence, frontier and terminal states per session. Preserve browser containment and evaluator-only truth.
Counterbalance condition order with a recorded seed. Temperature/settings identical across H/V.
Treat local cache/warmup as a possible timing confound and record warmup separately.

Reserve at most one separately labelled repair segment if the pilot exposes a harness defect.
Re-freeze code/config, preserve old results and never mix segments as a matched estimate.
No hot patches to an active assessment.

## Scoring and interpretation

Use existing evaluator after sealing sessions; never expose truth manifests or repository files to the tester.
For each condition report raw counts and denominators:
- seeded instances discovered, visited, relevant probe executed and evidence-backed reported;
- verified detection and misses;
- unsupported/unadjudicated claims, duplicates and malformed output;
- premature completion and open obligations;
- errors/timeouts/cancellation and non-comparable sessions;
- local requests, tokens where observed, wall time and hardware load.

Do not turn unadjudicated claims into zero false positives. Inspect all new claims against evidence;
label uncertain cases and review effort. Retain failures in intention-to-run counts alongside conditional scores.
Do not claim precision without a defensible adjudication denominator.
No inference of model beliefs from rationales; no claim of novel barrier discovery from seeded fixtures.
This development sample provides directional engineering evidence, not a statistically reliable product score.

Check known benchmark limitations in FRONTIER_BENCHMARK.md before using scores.
Neutral fixtures are small enough to avoid the large-view sampling issue, but assert size bounds.
Do not broaden the rule table or alter outcome semantics to improve measured results.
Historical Mistral trial 3's 2/6 result is context, not a matched comparator for this new experiment.

## Deliverables

1. A working experimental local-model runner and focused tests if code was missing.
2. A compact committed results document with exact experiment/run/commit/model IDs and per-condition table.
3. Durable raw traces/evidence plus checksummed manifest in the existing artifact workflow when available.
   Do not put bulky traces, personal data or secrets in git. If no durable store is available, preserve an
   archive on Nebu with absolute path/checksum and report that retention limitation explicitly.
4. Draft PR with runner changes and results; inspect CI triggers before pushing and avoid public scans.
5. Short conclusion: visibility helps/does not help/inconclusive; scheduler comparison; dominant failure;
   one proposed next action, not a platform roadmap.

Run focused checks while wiring; after final code changes run npm run build, normal npm test,
public-docs check and diff check once. Seek independent read-only exact-commit review within the time envelope.
Review may overlap analysis only on frozen source; do not contend with benchmark inference.
If review cannot finish, leave it pending in the draft PR without disguising self-review.

No merge, deployment, public website scan, outreach, real finding approval, probe promotion, DOs,
review UI or further publication infrastructure. All findings remain experimental internal candidates.

## Launch handoff

Claude Code on Nebu should read this file from branch plan/nebu-local-experiment-20261027, verify current main,
create its isolated implementation worktree, and start the 120-minute supervised experiment.
The cloud planning chat has no Nebu/Orca execution connector and has not launched or scheduled the run.
