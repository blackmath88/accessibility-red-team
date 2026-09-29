# Control Center Security and Safety Invariants

The control center is an operator surface for active web assessment. Production deployment must preserve these invariants.

## Authorization

- Read access and execution access are separate permissions.
- Cloudflare Access establishes operator identity; D1 operator records grant read, execute, and outreach permissions. Operators are seeded per deployment from a GitHub environment secret, never by a public migration; automation never grants outreach.
- The dashboard shell is served only after the Worker validates the Access JWT, so the dashboard fails closed even if the Access application is missing or misconfigured. Browser mutations must be same-origin.
- Starting scans/journeys requires an authenticated operator identity.
- Outreach sending requires a separate explicit approval permission.
- The engine never accepts arbitrary shell commands from UI input.

## Target safety

- Every requested digital property passes the existing public-target validation before execution.
- Run workers receive a canonical stored property URL, not an arbitrary URL supplied at execution time.
- Private, loopback, link-local, CGNAT (100.64.0.0/10, which includes Tailscale tailnet addresses), benchmark, multicast and IPv4-mapped private targets fail closed, so a redirect cannot steer the worker into the operator's private network.
- Redirect targets remain subject to engine scope rules.

## Execution

- Runs are durable objects with idempotency keys.
- Workers claim queued runs; UI requests do not execute Playwright inline.
- Nebuchadnezzar uses a Cloudflare Access service token over outbound HTTPS only. The Worker validates the Access JWT audience and exact service-token client identity, then checks the registered runner record.
- GitHub Actions callbacks use workflow-scoped OIDC. Dispatch uses a repository-scoped GitHub App installation token that is minted just in time and immediately revoked.
- Every runner mutation also requires an unguessable, expiring per-run lease token; only its SHA-256 is stored.
- State transitions are explicit and terminal states cannot restart.
- Engine git revision is recorded on every run; workers claim only runs for their own clean checkout's revision.
- Per-host concurrency 1 is enforced at claim time across every provider, and an expired lease is reclaimable only within a bounded attempt budget (3).
- Cancellation is a state transition, not process deletion; it invalidates the lease, and the next heartbeat terminates the local child process.
- A cancelled run cannot renew its lease, upload artifacts, or complete. An expired lease may be reclaimed as a new attempt.

## Evidence

- Artifacts are append-only and content-addressed with SHA-256.
- Reports reference evidence; they do not replace it.
- Failed/incomplete runs retain logs and partial evidence where safe.
- Throttle/backoff decisions and partial-run reasons are append-only provenance.
- Retention policy must be explicit before production rollout.

## Outreach

- Generated outreach is a draft artifact.
- No autonomous email sending.
- A human must approve recipient, subject, body and report attachment/link.
- Correspondence is append-only case history.

## Scale

- Do not enqueue ~2,000 organizations as one unbounded operation.
- Apply concurrency, per-host rate limits, retry budgets and backoff.
- The development default is per-host concurrency 1, five-second navigation pacing, and at most three bounded retries for HTTP 429/503; `Retry-After` is honored within the configured maximum.
- Schedule rescans rather than continuously polling sites.
- A municipality/site failure must not fail the cohort.
