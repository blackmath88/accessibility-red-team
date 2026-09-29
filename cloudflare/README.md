# Cloudflare control plane

Development control plane for the Accessibility Observatory:

```
Cloudflare Access (this application only)
      ↓
React Control Center + Worker API   (accessibility-observatory-dev, workers.dev)
      ↓
D1 metadata / run state             (accessibility-observatory-dev)
      ↓
private R2 evidence                 (accessibility-observatory-artifacts-dev)
      ↑
outbound HTTPS only (Access service token)
      ↑
Nebuchadnezzar persistent worker → Playwright + axe + SCOUT + journeys
```

Nebuchadnezzar never accepts inbound connections. It polls `POST /api/v1/runner/claim`.

## Resources

| Resource | Name | Binding / purpose |
| --- | --- | --- |
| Worker + static assets | `accessibility-observatory-dev` | React Control Center and `/api/v1/*` on `workers.dev` |
| D1 database | `accessibility-observatory-dev` | `DB` |
| Private R2 bucket | `accessibility-observatory-artifacts-dev` | `ARTIFACTS` |
| Access application | `Accessibility Observatory Dev` | protects only the Worker's `workers.dev` hostname |
| Access service token | `Nebuchadnezzar Observatory Dev` | outbound runner identity |
| GitHub environment | `cloudflare-development` | gated manual deployment from `main` |

No production resources, custom DNS, paid plans, R2 object locks or outreach sending are part of this setup.

## Configuration: what is committed and what is not

Committed in `wrangler.jsonc` (non-secret, and safe for forks to replace): the Worker, D1 and R2 names, the D1
database UUID of the development instance, and the GitHub repository/workflow names.

Placeholders that **fail closed** until injected at deploy time (`PENDING` → HTTP 503 for every operator,
runner and dashboard request):

| Worker var | Injected from GitHub environment variable |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | `ACCESS_TEAM_DOMAIN` (e.g. `<team>.cloudflareaccess.com`) |
| `ACCESS_AUD` | `ACCESS_AUD` (the Access application's audience tag) |
| `NEBUCHADNEZZAR_ACCESS_CLIENT_ID` | `NEBUCHADNEZZAR_ACCESS_CLIENT_ID` (service token client ID, not the secret) |
| `ENGINE_REVISION` | the deployed commit (`GITHUB_SHA`) |

Never committed anywhere: the Cloudflare API token, the Access service-token **secret** (lives only on
Nebuchadnezzar in a 0600 file), `GITHUB_APP_PRIVATE_KEY`, lease tokens, operator identities, `.env`/`.dev.vars`,
and assessment artifacts.

`account_id` is not committed; deployments use `CLOUDFLARE_ACCOUNT_ID`, and the deploy job refuses any account
other than the `CLOUDFLARE_EXPECTED_ACCOUNT_ID` environment variable.

### Operator seeding

Public migrations never create operators. The deploy job seeds one read/execute operator (never outreach) from
the `OPERATOR_EMAIL` / `OPERATOR_NAME` **secrets** of the `cloudflare-development` environment using
`scripts/cloudflare/seed-sql.ts operator`. The email must be the identity Cloudflare Access authenticates.

## Development deployment (from a phone, no workstation)

Five steps, all in the Cloudflare dashboard or GitHub web UI. The deploy job does the rest: it verifies the
account, checks D1 exists, creates the private R2 bucket if missing and refuses a public `r2.dev` URL, applies
migrations, seeds the operator (and optionally Wave 1 cases — never runs), deploys pinned to the commit, and
fails unless every unauthenticated request is refused. Its job summary shows the dashboard URL, the HTTP codes
of those unauthenticated probes, and D1 counts.

1. **Cloudflare API token** (My Profile → API Tokens → *Edit Cloudflare Workers* template), limited to the
   development account, with *Account → D1: Edit* and *Account → Workers R2 Storage: Edit* added and no zone
   resources; short expiry. R2 must be enabled on the account (free tier; no paid plan or object lock).
2. **GitHub** → Settings → Environments → `cloudflare-development` (deployment branches: `main`; required
   reviewer: you):
   - secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `OPERATOR_EMAIL` (the email Access will
     authenticate), `OPERATOR_NAME`;
   - variable `CLOUDFLARE_EXPECTED_ACCOUNT_ID` (same account ID);
   - repository variable `CLOUDFLARE_DEPLOY_ENABLED=true`.
3. **First deploy**: Actions → *Cloudflare control plane* → Run workflow on `main` with `deploy`,
   `first_deploy` and `seed_wave1` checked. Access is not configured yet, so the Worker answers **503** to every
   request (the job verifies this). The summary shows the `workers.dev` URL.
4. **Access for this Worker only**: Workers & Pages → `accessibility-observatory-dev` → Settings → Domains &
   Routes → `workers.dev` → *Enable Cloudflare Access* (not account-wide; preview URLs stay disabled). Rename
   the created application `Accessibility Observatory Dev`, set its policies to *Allow* → Emails → your operator
   email, and *Service Auth* → a new service token `Nebuchadnezzar Observatory Dev` (Zero Trust → Access →
   Service credentials). Store the token's Client Secret only in your password manager until the
   Nebuchadnezzar bootstrap. Add GitHub environment variables `ACCESS_TEAM_DOMAIN` (`<team>.cloudflareaccess.com`),
   `ACCESS_AUD` (the application's audience tag), `NEBUCHADNEZZAR_ACCESS_CLIENT_ID` (the token's Client ID) and
   `CONTROL_CENTER_API_URL` (the URL from step 3).
5. **Protected deploy**: run the workflow again with only `deploy` checked. It fails if `/`, `/api/v1/cases`,
   `/api/v1/runtime` or `/api/v1/runner/claim` answer anything but an Access redirect / 401 / 403 without
   credentials. Then open the URL on your phone and sign in with the operator email.

Every deploy pins `ENGINE_REVISION`. The UI queues runs for that revision and Nebuchadnezzar only claims runs
whose revision equals its own clean checkout, so after each deploy install the same SHA on Nebuchadnezzar.

## Security properties

- Operator identity: Cloudflare Access JWT validated in the Worker (issuer, audience, signature via cached
  JWKS), then D1 `operators` permissions (read / execute / outreach are separate; automation never grants
  outreach).
- Dashboard assets are served only after the same JWT validation (`run_worker_first: true`), so a missing or
  misconfigured Access application cannot expose the dashboard.
- Browser mutations must be same-origin and `application/json`.
- Nebuchadnezzar: Access service-token JWT pinned to the configured client ID (`common_name`), plus a
  registered, enabled `runner_agents` row.
- GitHub fallback: per-call workflow OIDC restricted to this repository, `assessment-runner.yml`,
  `workflow_dispatch`, and the configured audience; dispatch uses a repository-scoped GitHub App token that is
  revoked immediately. (Inactive until `GITHUB_APP_*` is configured.)
- Every runner mutation requires the unguessable per-run lease token; only its SHA-256 is stored.

## Execution safety (enforced server-side)

- Runs execute the stored `DigitalProperty.url`; the claim response carries it and the API accepts no target
  URL. Property URLs are immutable once stored (new URL → new property).
- Per-host concurrency 1 across all providers: a run is not claimable while any other unexpired lease exists
  on the same canonical host (`digital_properties.host_key`).
- Claims are filtered by engine revision; the runner re-checks and refuses a dirty checkout.
- Bounded retry budget: an expired lease is reclaimable at most until `attempt = 3`; an exhausted run stays
  visible until an operator cancels it. Site-level HTTP 429/503 handling (pacing, `Retry-After`, bounded
  exponential backoff, ≤3 retries) lives in the engine execution policy and is recorded as run events.
- `partial` is a valid terminal outcome; evidence is retained.
- Cancellation invalidates the lease; the runner's next heartbeat fails and it stops the child process.
- Artifacts are content-addressed in R2 (`sha256/<prefix>/<digest>`, checksum-verified, create-only);
  `artifacts`, `run_events` and `audit_events` rows are append-only.

## API

- Operator: `GET /api/v1/cases`, `GET /api/v1/runtime`, `POST /api/v1/runs`, compatibility
  `POST /api/v1/cases/:id/runs`, `POST /api/v1/runs/:id/cancel`, `GET /api/v1/runs/:id`.
- Nebuchadnezzar: `POST /api/v1/runner/claim` (204 = no work), and the harmless self-test
  `POST /api/v1/runner/selftest`, `POST /api/v1/runner/selftest/:id/heartbeat`, `POST /api/v1/runner/selftest/:id/complete`
  (never touches the run queue or any site).
- GitHub Actions: `POST /api/v1/runs/:id/claim` with workflow OIDC.
- Both runners: `POST /lease/renew`, `POST /events`, `PUT /artifacts`, `POST /complete`, `POST /fail`.

## Local validation

```sh
npm run cloudflare:typecheck
npm run cloudflare:test        # includes the Worker against real SQLite with both migrations
npm run cloudflare:dry-run
```

## Retention (before production)

Lock only signed final reports and cited evidence (e.g. 30 days); retain raw probe/journey evidence 30–90 days
via lifecycle rules; reproducible logs 14–30 days. Decide after data classification and cost review.
