# Control Center Architecture

## Boundary

`accessibility-red-team` remains the assessment engine. The control center coordinates organizations, properties, cases, runs, artifacts, reports and outreach.

```text
Browser UI
   |
authenticated API
   |
ControlCenterStore ---- metadata DB
   |
run request / queue
   |
worker
   |
accessibility-red-team
   |
artifact sink ---------- object storage
```

## Durable model

- Organization: persistent subject; municipality is the first type.
- DigitalProperty: website/portal/application belonging to an organization.
- AssessmentCase: lifecycle around assessment, review, report, outreach and rescan.
- Run: immutable intent plus controlled execution state.
- Artifact: immutable evidence/output descriptor with digest.
- AuditEvent: append-only record of consequential operator/system actions.

## Deployment adapter

The core deliberately does not import Cloudflare, Postgres, D1, R2, Dagu or another queue implementation. Production adapters must implement the store/queue/artifact interfaces and preserve the same contracts.

A practical first deployment can use Cloudflare for the control plane (Workers + D1 + R2 + Queues) while browser-heavy Playwright workers run in a container environment. Do not assume a serverless edge runtime can safely host Chromium workloads at national scale.
