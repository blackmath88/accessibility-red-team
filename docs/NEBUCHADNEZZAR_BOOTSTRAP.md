# Nebuchadnezzar worker bootstrap

Nebuchadnezzar runs the persistent outbound worker as the unprivileged `achim` user under a **user-level**
systemd service. It polls the control plane over HTTPS; nothing listens inbound, and no Cloudflare route to the
host is needed. Everything below is executable from an Android SSH client over Tailscale.

Script: [`ops/nebuchadnezzar/observatory-worker.sh`](../ops/nebuchadnezzar/observatory-worker.sh).

## Prerequisites

- The control plane is deployed and Access is configured (see `cloudflare/README.md`), and the deployed
  `ENGINE_REVISION` is the SHA you install here.
- Node ≥ 20, npm and git available to `achim` (the deterministic pilot used Node 26 / npm 11).
- The Access service token **Client ID** and **Client Secret** for `Nebuchadnezzar Observatory Dev`.

## 1. Fetch the reviewed script at an exact commit

```sh
SHA=<40-char commit deployed to the control plane>
mkdir -p ~/observatory-worker/bin
curl -fsSL "https://raw.githubusercontent.com/blackmath88/accessibility-red-team/${SHA}/ops/nebuchadnezzar/observatory-worker.sh" \
  -o ~/observatory-worker/bin/observatory-worker.sh
chmod 700 ~/observatory-worker/bin/observatory-worker.sh
less ~/observatory-worker/bin/observatory-worker.sh      # review before running
alias ow=~/observatory-worker/bin/observatory-worker.sh
```

## 2. Credentials (outside the repository, mode 0600)

```sh
ow configure
nano ~/.config/accessibility-observatory/worker.env
```

Replace each `REPLACE_ME` locally on the host:

| Key | Value |
| --- | --- |
| `CONTROL_CENTER_API_URL` | `https://accessibility-observatory-dev.<subdomain>.workers.dev` |
| `CF_ACCESS_CLIENT_ID` | service token Client ID (ends in `.access`) |
| `CF_ACCESS_CLIENT_SECRET` | service token Client Secret — type/paste it only here |

Never paste the secret into chat, GitHub, shell history arguments, or logs. The script never prints it.

## 3. Install, verify, self-test and start

```sh
ow install "$SHA"
```

This mirrors the public repository, creates an isolated detached checkout at exactly `$SHA` (refusing tracked
modifications), runs `npm ci`, installs Playwright Chromium into `~/.cache/ms-playwright` (no system packages),
launches Chromium once, runs the build and offline test suite, then runs the **harmless self-test**
(Access service authentication → claim → heartbeat → completion against `/api/v1/runner/selftest`, which never
touches the run queue or any municipal site). Only after the self-test passes does it point `current` at the new
checkout, write `~/.config/systemd/user/observatory-worker.service`, and enable/restart it.

If linger is not enabled the script says so. Enabling it is a one-time admin action you may choose:
`sudo loginctl enable-linger achim`. Without linger the worker stops at logout and does not start at boot.

## Operate

```sh
ow status          # current/rollback revision, service state, linger
ow logs            # last 200 journal lines;  ow logs -f  to follow
ow selftest        # re-run the harmless end-to-end check
ow install <sha>   # upgrade: prepares and self-tests the new SHA before switching
ow rollback        # switch back to the previously installed SHA
ow disable         # stop and disable the worker (leases expire and become reclaimable)
```

The Control Center sidebar shows the worker's last contact time (updated by claims and self-tests).

## Upgrade rule

Deploy the control plane and install the worker at the **same SHA**. Runs are queued for the deployed
`ENGINE_REVISION`, and the worker claims only runs matching its own clean checkout, so a mismatch leaves runs
queued rather than executing unreviewed code.

## Rotation / revocation

Revoke the service token in Zero Trust → Access → Service credentials, create a new one, update
`NEBUCHADNEZZAR_ACCESS_CLIENT_ID` in the GitHub environment and redeploy, then edit `worker.env` and
`ow selftest`. To lock the worker out immediately without touching the host, revoke the token or set the
`runner_agents.enabled` flag to 0 in the D1 console.
