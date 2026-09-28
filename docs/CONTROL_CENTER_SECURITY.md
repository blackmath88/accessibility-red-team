# Control Center Security and Safety Invariants

The control center is an operator surface for active web assessment. Production deployment must preserve these invariants.

## Authorization

- Read access and execution access are separate permissions.
- Starting scans/journeys requires an authenticated operator identity.
- Outreach sending requires a separate explicit approval permission.
- The engine never accepts arbitrary shell commands from UI input.

## Target safety

- Every requested digital property passes the existing public-target validation before execution.
- Run workers receive a canonical stored property URL, not an arbitrary URL supplied at execution time.
- Private, loopback, link-local and otherwise disallowed targets fail closed.
- Redirect targets remain subject to engine scope rules.

## Execution

- Runs are durable objects with idempotency keys.
- Workers claim queued runs; UI requests do not execute Playwright inline.
- State transitions are explicit and terminal states cannot restart.
- Engine git revision is recorded on every run.
- Cancellation is a state transition, not process deletion.

## Evidence

- Artifacts are append-only and content-addressed with SHA-256.
- Reports reference evidence; they do not replace it.
- Failed/incomplete runs retain logs and partial evidence where safe.
- Retention policy must be explicit before production rollout.

## Outreach

- Generated outreach is a draft artifact.
- No autonomous email sending.
- A human must approve recipient, subject, body and report attachment/link.
- Correspondence is append-only case history.

## Scale

- Do not enqueue ~2,000 organizations as one unbounded operation.
- Apply concurrency, per-host rate limits, retry budgets and backoff.
- Schedule rescans rather than continuously polling sites.
- A municipality/site failure must not fail the cohort.
