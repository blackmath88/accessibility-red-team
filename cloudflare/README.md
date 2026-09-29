# Cloudflare control plane

This directory is the proposed development control plane for the Accessibility Observatory. It is implemented for local validation only. No remote resource has been created.

## Exact future resources

| Resource | Name | Binding / purpose |
| --- | --- | --- |
| Worker + static assets | `accessibility-observatory-dev` | React Control Center and `/api/v1/*` |
| D1 database | `accessibility-observatory-dev` | `DB` |
| Private R2 bucket | `accessibility-observatory-artifacts-dev` | `ARTIFACTS` |
| Cloudflare Access application | `Accessibility Observatory Dev` | operator authentication |
| GitHub environment | `cloudflare-development` | gated manual deployment |

The committed D1 ID is the explicit non-resource placeholder `00000000-0000-0000-0000-000000000000`. Replace it with the created database UUID only after creation is separately approved. `ACCESS_*` and `GITHUB_APP_*` values marked `PENDING` also fail closed.

## Bindings and credentials

- `ASSETS`: `control-center/dist`, with Worker-first routing only for `/api/*`.
- `DB`: D1 relational records and append-only artifact/audit metadata.
- `ARTIFACTS`: private R2 evidence blobs.
- `GITHUB_APP_PRIVATE_KEY`: future Worker secret; the Worker uses it only to sign a GitHub App JWT. The resulting installation bearer token is scoped to this repository plus `Actions: write`, expires after one hour, and is explicitly revoked after dispatch.
- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`: future GitHub environment secrets. Deployment refuses an account ID other than `0b32c4ab8bf48c4e1787c0fa763020fe`.
- `CONTROL_CENTER_API_URL`: future GitHub repository/environment variable used by the external runner.

Operator identity is a validated Cloudflare Access JWT. Read, execute, and outreach authorization are separate email allowlists. Runner identity is a GitHub Actions OIDC JWT restricted to repository `blackmath88/accessibility-red-team`, workflow `assessment-runner.yml`, event `workflow_dispatch`, and audience `accessibility-observatory-control-plane`.

## Migration

`migrations/0001_control_center.sql` creates organizations, digital properties, assessment cases, runs, artifacts, contacts, outreach, audit events, and workflow dispatch records. It preserves the Organization → DigitalProperty → AssessmentCase → Run → Artifact foreign-key chain. Runs retain a unique idempotency key and immutable engine revision. Artifact rows and audit events reject updates and deletes.

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
