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

All steps are Cloudflare dashboard or GitHub web actions.

1. **Cloudflare API token** (dashboard → My Profile → API Tokens → Create custom token), scoped to the
   development account only: *Account → Workers Scripts: Edit*, *Account → D1: Edit*,
   *Account → Workers R2 Storage: Edit* (only needed if the bucket must be created via API; otherwise omit).
   Set a short expiry.
2. **R2 bucket** `accessibility-observatory-artifacts-dev` (dashboard → R2) if it does not exist. Leave public
   access disabled. Do not add an object lock.
3. **GitHub** → Settings → Environments → `cloudflare-development`: restrict deployment branches to `main` and
   require yourself as reviewer. Add
   - secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `OPERATOR_EMAIL`, `OPERATOR_NAME`;
   - variables: `CLOUDFLARE_EXPECTED_ACCOUNT_ID`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`,
     `NEBUCHADNEZZAR_ACCESS_CLIENT_ID`, `CONTROL_CENTER_API_URL` (`https://accessibility-observatory-dev.<subdomain>.workers.dev`);
   - repository variable `CLOUDFLARE_DEPLOY_ENABLED=true`.
4. **Access for this Worker only.** Workers & Pages → `accessibility-observatory-dev` → Settings → Domains &
   Routes → `workers.dev` → *Enable Cloudflare Access*. This creates an Access application for that one
   hostname; do not enable account-wide Access for all Workers. Rename it `Accessibility Observatory Dev`. Keep
   *preview URLs* disabled (they are disabled in `wrangler.jsonc`). Policies on that application:
   - *Allow* — Include: Emails → your operator email.
   - *Service Auth* — Include: Service Token → `Nebuchadnezzar Observatory Dev`.
   Copy the application's **Audience (AUD) tag** into `ACCESS_AUD`.
5. **Service token** (Zero Trust → Access → Service credentials → Service tokens) named
   `Nebuchadnezzar Observatory Dev`. Copy the **Client ID** into `NEBUCHADNEZZAR_ACCESS_CLIENT_ID`. The
   **Client Secret** is shown once: paste it only into the Nebuchadnezzar credential file (see
   `docs/NEBUCHADNEZZAR_BOOTSTRAP.md`), nowhere else.
6. **Deploy**: GitHub → Actions → *Cloudflare control plane* → Run workflow on `main` with `deploy=true`
   (and `seed_wave1=true` once you want the Wave 1 cases to exist). The job validates, applies D1 migrations,
   seeds the operator, deploys with `ENGINE_REVISION` = the commit, and then **fails** if `/`, `/api/v1/cases`
   or `/api/v1/runtime` answer anything other than an Access redirect/401/403 without credentials.

**First deploy** (the Worker must exist before step 4 is possible): run the workflow with `deploy=true` and
`first_deploy=true`. Access values are not required; the Worker deploys with `PENDING` Access configuration and
answers HTTP 503 to every request (dashboard included). Then do steps 4–5, set the variables, and run again with
`first_deploy=false`, which also runs the unauthenticated-reachability check.

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
