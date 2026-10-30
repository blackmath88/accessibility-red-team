# Campaign rehearsal record — 30 October 2026

Local fixtures only (two known checkout pairs). This was a rehearsal of launch readiness, not a blind result: the
fixtures and their sealed keys are from the earlier transfer cases t1 and t2. No public site was contacted.
Every Claude call went through the subscription CLI. No Mistral or other paid API was used.

## rehearsal-4 (the reference run; evidence in [rehearsal-4/](rehearsal-4/))

Configuration: [rehearsal.config.json](rehearsal.config.json) with the ID changed. The run had a deliberately tiny budget of 3 Claude invocations, a 30-minute wall limit and concurrency 2.

| Session | What happened | Evidence (event seq) |
|---|---|---|
| 1 | Scope validated: fixtures and the cached t1 judgment were hashed. **Claude strategy** measured all four shipping units first, "since that report is new", and re-checked only transfer-a for order-review, relying on cached t1 for its control (6 measured, 2 skipped). The **algorithmic baseline** ran on 6 units, 2 in parallel. **Claude triage** opened one investigation (second-a @ 390x844: text absent from hit testing at 8/16 points on the phone only; control second-b clean). It **rejected** both transfer-a signals with a reason: the same signature was already explained by cached t1. The investigation design then hit the soft threshold (2/3 committed; the last invocation is reserved for finishing), so the campaign settled, wrote a **partial report** and checkpointed as `budget_exhausted`. | 8–52 |
| — | `extend --invocations 8 --reason …`: config v2, `budget_amended` with the previous and new ceilings, the reason and the consumed usage. A lower ceiling is refused. | 53 |
| 2 | Resumed. The Claude design call was in flight when the **controller's process group was SIGKILLed** (crash injection). No Claude process survived. | 55–57 |
| 3 | Resumed after the crash. The interrupted task was requeued and the in-flight call was **counted as consumed**. The design was made again (nothing had been saved) and **passed the gate** first time. The probe was executed by the transfer stage on both pages. During the conclusion call the operator ran **`stop`**: the call was terminated, counted, and the task **paused at its `executed` step**. | 58–73 |
| 4 | Resumed. Execution was not repeated. The conclusion was frozen through `import-conclusion`: **supported**, second-a defective (the notice box ends at y=602 and the text at y=632; text absent from hit testing below the edge; control second-b ends at 642). It matches the sealed t2 key. A **fresh replay** of both pages reproduced the signal on second-a and none on second-b. The dossier was written and the campaign `completed`. | 75–90 |

Verified from the log: the 9 tasks completed before the extension were each started once. Evidence grew from 6 to 8 items and none was overwritten. Usage carried over: 2 → 6 invocations and 52 s → 216 s of wall time. Event seq ran 1–90 without gaps. The UI kept polling throughout; after the crash it showed the controller as not running, with its last heartbeat.

Resources (from the CLI JSON results):
- **Invocations:** 6 of 8 Claude invocations. Of these, 1 was terminated by the stop and 1 by the crash.
- **Measured tokens, 4 calls:** input 8, cache creation 13,522, cache read 24,481, output 17,398 (thinking 8,425).
- **Unknown tokens, 2 calls:** the stop-terminated call. The crash-killed call was not counted as unknown in this run; that gap is fixed in the final commit.

## Earlier runs (kept as found)

- **rehearsal-1:** a correct soft-threshold pause. Its `task_started` events carry the wrong `kind` field, because event data could overwrite the envelope; fixed.
- **rehearsal-2:** Claude named the control as a unit ID. The controller misreported its "investigate" decision as a rejection; fixed (control resolution, and `investigation_not_opened` with an inconclusive case). This run also showed that the campaign continues while the dashboard server is down, and that the view reconnects.
- **rehearsal-3:** exhaust, extend and resume worked. The conclusion then exceeded the stored schema (2,262 characters against a 2,000 limit), so the branch closed while the replay and report still ran. Three fixes followed:
  - the prompt now states the limits;
  - one corrective call is allowed;
  - a closed investigation now marks its case inconclusive.

An independent review of `3e19c86` found 3 blockers and 3 majors:
- a crash fenced the campaign permanently;
- a stop closed investigations for good;
- non-idempotent sub-steps;
- the soft threshold stopped everything;
- resume lost in-flight calls;
- transfer child processes were not settled.

All were fixed in `140d95c`. rehearsal-4 then exercised the crash, stop and resume paths. A fresh re-review of `140d95c` confirmed the fixes for B1, B2, M1 and M2, and found two remaining majors:
- **M3 was a no-op:** the child process was read from the `.catch()` promise, so `transfer` children were never settled.
- **Unsound completion check:** an existing `results.json` was taken to mean execution had finished, but the transfer stage writes it even after an aborted run.

Both are fixed in `6638569`. Execution is now skipped only when a completion marker exists, and that marker is written after a clean exit. Its minors are fixed too: case summaries are scrubbed and the path patterns are wider, a corrective conclusion call is made only for a schema rejection, triage never reuses an investigation ID, and the offline `stop` and `extend` commands use the repaired log.

rehearsal-5 (`6638569`, 8 invocations, no exhaustion): `stop` was issued the moment the investigation reached `validated`. Execution finished within the 2 s stop poll, so the task paused at the conclusion gate instead. The resume completed the run (case supported; 4 invocations, all with measured usage). This run did **not** exercise a stop during `transfer execute`. The child-settlement fix rests on the reviewer's check that the `execFile` promise itself carries `.child`.

Remaining limits:
- Sandbox measurements already running are not killed by a stop; they are bounded by the sandbox timeouts.
- Two simultaneous `resume` commands for one campaign are narrowed by a lock re-check but not made impossible.
- Strategy and triage replies are not cached. A crash during either repeats that call; the cost is counted.
- `repairLog` truncates the log at the first unparseable line, not only at a trailing one.

## Readiness for a live Basel launch — not ready yet

This slice is ready to rehearse; it has no live authority. These prerequisites remain:

1. **A public manifest per launch.** It needs exact origins, actions and a request budget, and it must be enforced at the broker for every load. The broker's live mode admits one URL; a campaign needs a multi-origin allowlist with per-host backoff and rate-limit pauses.
2. **Discovery and assessment on public pages.** Milestone 1 is a static config here. The Basel pilot needs sourced public bodies, tasks and boundaries, so Scout and discovery must be wired in. The baseline probe checks one known key text; real coverage needs the existing scanner (`scanUrl`) and keyboard checks admitted through the same manifest.
3. **Token ceiling.** The CLI reports usage but cannot cap output per call. The 500k/60k figures stay a target unless a route with enforced output limits and conservative reservations is used.
4. **Dossier.** The dossier is deterministic markdown. Screenshot cases, consolidation and a publication-grade report remain, along with the existing human approval before anything is published.
5. **Orca.** Workers here are `claude -p` processes owned by the controller's scheduler. Supervised Orca workers with verified settlement were not used; they would add overhead at this size.
6. **Review.** A focused re-review of the fixes is recorded in the PR. Live launch needs the review gate from the pilot plan.
