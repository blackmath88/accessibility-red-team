# Cloudflare control plane

This directory is the proposed development control plane for the Accessibility Observatory. It is implemented for local validation only. No remote resource has been created.

## Exact future resources

| Resource | Name | Binding / purpose |
| --- | --- | --- |
| Worker + static assets | `accessibility-observatory-dev` | React Control Center and `/api/v1/*` |
| D1 database | `accessibility-observatory-dev` | `DB` |
| Private R2 bucket | `accessibility-observatory-artifacts-dev` | `ARTIFACTS` |
| Cloudflare Access application | `Accessibility Observatory Dev` | operator authentication |
| Cloudflare Access service token | `Nebuchadnezzar Observatory Dev` | outbound runner authentication |
| GitHub environment | `cloudflare-development` | gated manual deployment |

The committed D1 ID is the explicit non-resource placeholder `00000000-0000-0000-0000-000000000000`. Replace it with the created database UUID only after creation is separately approved. `ACCESS_*` and `GITHUB_APP_*` values marked `PENDING` also fail closed.

## Bindings and credentials

- `ASSETS`: `control-center/dist`, with Worker-first routing only for `/api/*`.
- `DB`: D1 relational records and append-only artifact/audit metadata.
- `ARTIFACTS`: private R2 evidence blobs.
- `GITHUB_APP_PRIVATE_KEY`: future Worker secret; the Worker uses it only to sign a GitHub App JWT. The resulting installation bearer token is scoped to this repository plus `Actions: write`, expires after one hour, and is explicitly revoked after dispatch.
- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`: future GitHub environment secrets. Deployment refuses an account ID other than `0b32c4ab8bf48c4e1787c0fa763020fe`.
- `CONTROL_CENTER_API_URL`: future GitHub repository/environment variable used by the external runner.
- `NEBUCHADNEZZAR_ACCESS_CLIENT_ID`: non-secret Access service-token client ID used to pin the accepted machine identity.
- `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`: future Nebuchadnezzar host credentials. They are never stored in the Worker, repository, or GitHub.

Operator identity is a validated Cloudflare Access JWT. D1 `operators` rows provide separate read, execute, and outreach authorization; the seeded account is `achim.imboden@bridge-work.ai` with read/execute only. Nebuchadnezzar is a registered D1 runner and authenticates through an Access service-token JWT pinned to its client ID. GitHub runner identity is a freshly minted GitHub Actions OIDC JWT on each control-plane call, restricted to repository `blackmath88/accessibility-red-team`, workflow `assessment-runner.yml`, event `workflow_dispatch`, and audience `accessibility-observatory-control-plane`.

The only future long-lived Worker secret is `GITHUB_APP_PRIVATE_KEY`. It replaces the rejected `GITHUB_ACTIONS_TOKEN` design: the Worker signs a nine-minute app JWT, requests a repository-scoped installation token (maximum one hour), dispatches the workflow, then revokes it. Run callbacks do not reuse that credential.

## Migration

`migrations/0001_control_center.sql` creates organizations, digital properties, assessment cases, runs, artifacts, contacts, outreach, operators, runner agents, append-only run/audit events, and workflow dispatch records. It preserves the Organization → DigitalProperty → AssessmentCase → Run → Artifact foreign-key chain. Runs retain a unique idempotency key, immutable engine revision, provider, stage, policy, progress, attempt and renewable lease metadata. Artifact, run-event, and audit rows reject updates and deletes.

R2 objects use `sha256/<prefix>/<digest>` keys. Uploads supply a SHA-256 checksum for R2 verification and use create-only conditional writes. This provides development immutability without an R2 object-lock rule.

For production, start with selective protection rather than a bucket-wide development policy: lock signed final reports and their cited evidence for 30 days, retain raw probe/journey evidence for 30–90 days using lifecycle rules, and keep reproducible logs for 14–30 days. Increase legal/audit evidence retention only after data classification, deletion obligations, and expected storage cost are approved. A separate locked evidence bucket is preferable if only a subset needs compliance retention.

## Local validation

```sh
npm run cloudflare:types
npm run cloudflare:typecheck
npm run cloudflare:test
npx wrangler d1 migrations apply accessibility-observatory-dev --local
npm run cloudflare:dry-run
```

Do not add `--remote`, run `wrangler deploy` without `--dry-run`, create a bucket/database, enable R2, or configure Access/DNS until separately approved.

## API and execution protocols

- Operator: `GET /api/v1/cases`, `POST /api/v1/runs`, compatibility `POST /api/v1/cases/:id/runs`, `POST /api/v1/runs/:id/cancel`, and `GET /api/v1/runs/:id`.
- Nebuchadnezzar: `POST /api/v1/runner/claim` with Access service-token headers. A 204 response means no work.
- GitHub Actions: `POST /api/v1/runs/:id/claim` with workflow OIDC.
- Both runners: `POST /lease/renew`, `POST /events`, `PUT /artifacts`, `POST /complete`, and `POST /fail`, all requiring the provider identity plus `x-run-lease-token`.

`npm run control-center:worker` is the foreground outbound poller for Nebuchadnezzar. It runs one job at a time and does not install or alter a system service. Required host variables are `CONTROL_CENTER_API_URL`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET`; optional values are `CONTROL_CENTER_WORKER_ID=nebuchadnezzar` and `CONTROL_CENTER_POLL_MS` (default 15000).

## Host-safe execution

The default policy enforces one worker job and per-host concurrency 1, five-second navigation pacing, three retries for HTTP 429/503, bounded exponential backoff, and bounded `Retry-After`. The policy and decisions are written to `execution-policy.json`, uploaded to R2, and material backoff events are copied to append-only D1 events/audit metadata. A site-level failure retains logs and evidence; valid incomplete results may use the `partial` terminal state.
