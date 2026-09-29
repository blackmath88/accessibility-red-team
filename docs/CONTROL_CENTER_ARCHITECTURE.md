# Control Center Architecture

## Boundary

`accessibility-red-team` remains the assessment engine. The control center coordinates organizations, properties, cases, runs, artifacts, reports and outreach.

```text
React UI + operator Access JWT
              |
Worker API ---+--- D1 metadata, queue, leases, audit log
              |
              +--- R2 content-addressed evidence
              |
      provider adapter
       /             \
Nebuchadnezzar      GitHub App dispatch
outbound poll       GitHub Actions OIDC callback
       \             /
       accessibility-red-team + Playwright
```

## Durable model

- Organization: persistent subject; municipality is the first type.
- DigitalProperty: website/portal/application belonging to an organization.
- AssessmentCase: lifecycle around assessment, review, report, outreach and rescan.
- Run: immutable intent plus controlled execution state, provider, host-safety policy, stage, progress and renewable lease.
- Artifact: immutable evidence/output descriptor with digest.
- AuditEvent: append-only record of consequential operator/system actions.

## Deployment adapter

The core deliberately does not import Cloudflare, Postgres, D1, R2, Dagu or another queue implementation. Production adapters must implement the store/queue/artifact interfaces and preserve the same contracts.

The first deployment uses Workers Static Assets, a Worker API, D1 and R2. Browser-heavy Playwright execution remains outside Workers. `nebuchadnezzar_worker` is the default pull provider: the host makes outbound HTTPS claim/renew/upload/complete calls and requires no inbound route. `github_actions` remains a push provider: the Worker dispatches the approved workflow through a short-lived GitHub App installation token and the workflow authenticates callbacks with OIDC.

Provider details are confined to authentication and queue adapters. Both paths use the same Run and Artifact contracts. A claim atomically changes a queued (or expired-lease) run to running, issues a random lease whose SHA-256 only is stored, and records the attempt. Renewals update stage/progress. Cancellation invalidates the lease. Expired work can be reclaimed without making artifact writes mutable.

Default host-safety policy is one active run per worker, per-host concurrency 1, five seconds between navigations, three retries, bounded exponential backoff for 429/503, and `Retry-After` support. Decisions are retained in `execution-policy.json`, uploaded as evidence, and material backoff events are also appended to D1. Exhausted work may complete as `partial` when valid evidence exists.
