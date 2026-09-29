#!/usr/bin/env bash
# Accessibility Observatory — Nebuchadnezzar outbound worker bootstrap.
#
# Runs as the unprivileged operator account (never root). Everything lives in user space:
#   ~/observatory-worker/repo.git            mirror of the public repository
#   ~/observatory-worker/checkouts/<sha>     one isolated, detached checkout per exact commit
#   ~/observatory-worker/current -> ...      the checkout the service runs
#   ~/.config/accessibility-observatory/worker.env   credentials (mode 0600, never in the repo)
#   ~/.config/systemd/user/observatory-worker.service
#
# The worker only makes outbound HTTPS requests to the control plane; nothing listens inbound.
# This script never prints credential values.
#
# Usage:
#   observatory-worker.sh configure            create the credential file template (0600) and stop
#   observatory-worker.sh install <sha>        prepare <sha>, verify, self-test, switch service to it
#   observatory-worker.sh selftest             auth -> claim -> heartbeat -> harmless completion
#   observatory-worker.sh status               service, revision, linger and recent log summary
#   observatory-worker.sh logs [-f]            worker journal
#   observatory-worker.sh rollback             switch back to the previously installed revision
#   observatory-worker.sh disable              stop the worker and disable it at login/boot
set -euo pipefail
set +x
umask 077

REPO_URL="${OBSERVATORY_REPO_URL:-https://github.com/blackmath88/accessibility-red-team.git}"
EXPECTED_USER="${OBSERVATORY_USER:-achim}"
ROOT="${OBSERVATORY_HOME:-$HOME/observatory-worker}"
MIRROR="$ROOT/repo.git"
CHECKOUTS="$ROOT/checkouts"
CURRENT="$ROOT/current"
PREVIOUS_FILE="$ROOT/previous-revision"
CONF_DIR="$HOME/.config/accessibility-observatory"
ENV_FILE="$CONF_DIR/worker.env"
UNIT_NAME="observatory-worker.service"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/$UNIT_NAME"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"

log() { printf '[observatory] %s\n' "$*"; }
die() { printf '[observatory] ERROR: %s\n' "$*" >&2; exit 1; }

preflight() {
  [ "$(id -u)" -ne 0 ] || die "do not run as root; run as $EXPECTED_USER"
  [ "$(id -un)" = "$EXPECTED_USER" ] || die "expected user $EXPECTED_USER, got $(id -un) (override with OBSERVATORY_USER)"
  for tool in git node npm; do command -v "$tool" >/dev/null || die "$tool not found on PATH"; done
  local major; major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 20 ] || die "Node >= 20 required, found $(node --version)"
  if [ -z "${XDG_RUNTIME_DIR:-}" ] && [ -d "/run/user/$(id -u)" ]; then export XDG_RUNTIME_DIR="/run/user/$(id -u)"; fi
}

have_user_systemd() { systemctl --user show-environment >/dev/null 2>&1; }

configure() {
  mkdir -p "$CONF_DIR"; chmod 700 "$CONF_DIR"
  if [ -f "$ENV_FILE" ]; then
    chmod 600 "$ENV_FILE"; log "credential file exists: $ENV_FILE (mode 0600, contents not shown)"
  else
    cat > "$ENV_FILE" <<'EOF'
# Accessibility Observatory worker credentials. Mode 0600. Never commit or paste this file.
CONTROL_CENTER_API_URL=https://accessibility-observatory-dev.REPLACE_ME.workers.dev
CF_ACCESS_CLIENT_ID=REPLACE_ME
CF_ACCESS_CLIENT_SECRET=REPLACE_ME
CONTROL_CENTER_WORKER_ID=nebuchadnezzar
CONTROL_CENTER_POLL_MS=30000
EOF
    chmod 600 "$ENV_FILE"
    log "created $ENV_FILE (mode 0600). Edit it locally, replacing every REPLACE_ME:"
    log "  nano $ENV_FILE"
  fi
}

check_env_file() {
  [ -f "$ENV_FILE" ] || die "missing $ENV_FILE; run: $0 configure"
  [ "$(stat -c %a "$ENV_FILE")" = "600" ] || die "$ENV_FILE must be mode 0600"
  [ "$(stat -c %U "$ENV_FILE")" = "$(id -un)" ] || die "$ENV_FILE must be owned by $(id -un)"
  if grep -q 'REPLACE_ME' "$ENV_FILE"; then die "$ENV_FILE still contains REPLACE_ME placeholders"; fi
  for key in CONTROL_CENTER_API_URL CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET; do
    grep -Eq "^${key}=.+" "$ENV_FILE" || die "$ENV_FILE is missing $key"
  done
  grep -Eq '^CONTROL_CENTER_API_URL=https://' "$ENV_FILE" || die "CONTROL_CENTER_API_URL must be https://"
}

run_selftest() {
  local dir="$1"
  check_env_file
  log "self-test from $(git -C "$dir" rev-parse HEAD): Access auth -> claim -> heartbeat -> completion"
  ( set -a; . "$ENV_FILE"; set +a; cd "$dir"; node --import tsx scripts/nebuchadnezzar-selftest.ts )
}

prepare_checkout() {
  local sha="$1" dir="$CHECKOUTS/$1"
  mkdir -p "$ROOT" "$CHECKOUTS"
  if [ -d "$MIRROR" ]; then git -C "$MIRROR" fetch --prune --quiet origin; else git clone --mirror --quiet "$REPO_URL" "$MIRROR"; fi
  git -C "$MIRROR" cat-file -e "${sha}^{commit}" 2>/dev/null || die "commit $sha not found in $REPO_URL"
  if [ ! -d "$dir/.git" ]; then
    git clone --quiet --no-checkout "$MIRROR" "$dir"
    git -C "$dir" -c advice.detachedHead=false checkout --quiet --detach "$sha"
  fi
  [ "$(git -C "$dir" rev-parse HEAD)" = "$sha" ] || die "checkout HEAD is not $sha"
  [ -z "$(git -C "$dir" status --porcelain --untracked-files=no)" ] || die "checkout $dir has tracked modifications"
  log "installing project dependencies (user space) for $sha"
  ( cd "$dir" && npm ci --no-audit --no-fund --loglevel=error )
  log "installing Playwright Chromium into $PLAYWRIGHT_BROWSERS_PATH (no system packages)"
  ( cd "$dir" && npx --no-install playwright install chromium )
  log "verifying Node / Playwright / Chromium"
  ( cd "$dir" && node --input-type=module -e '
      import { chromium } from "playwright";
      const browser = await chromium.launch();
      const page = await browser.newPage(); await page.setContent("<h1>ok</h1>");
      if (await page.textContent("h1") !== "ok") throw new Error("Chromium page check failed");
      console.log(JSON.stringify({ node: process.version, chromium: browser.version() }));
      await browser.close();' )
  log "build and offline test suite"
  ( cd "$dir" && npm run --silent build && npm test --silent >"$dir/.bootstrap-test.log" 2>&1 ) \
    || die "tests failed; see $dir/.bootstrap-test.log"
  [ -z "$(git -C "$dir" status --porcelain --untracked-files=no)" ] || die "install modified tracked files in $dir"
}

write_unit() {
  local node_bin; node_bin="$(command -v node)"
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Accessibility Observatory outbound worker (polls control plane over HTTPS)
StartLimitIntervalSec=900
StartLimitBurst=5

[Service]
Type=simple
WorkingDirectory=$CURRENT
EnvironmentFile=$ENV_FILE
Environment=PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH
Environment=PATH=$(dirname "$node_bin"):/usr/local/bin:/usr/bin:/bin
ExecStart=$node_bin --import tsx scripts/nebuchadnezzar-worker.ts
Restart=on-failure
RestartSec=60
KillMode=control-group
TimeoutStopSec=60
NoNewPrivileges=yes
UMask=0077

[Install]
WantedBy=default.target
EOF
  chmod 600 "$UNIT_FILE"
}

report_linger() {
  if [ "$(loginctl show-user "$(id -un)" --property=Linger --value 2>/dev/null || echo unknown)" = "yes" ]; then
    log "linger: enabled — the worker survives logout and starts at boot"
  else
    log "linger: NOT enabled — the worker stops when your last session ends and will not start at boot."
    log "  one-time admin action (only if you want that): sudo loginctl enable-linger $(id -un)"
  fi
}

install() {
  local sha="${1:-}"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "install requires an exact 40-character commit SHA"
  preflight
  have_user_systemd || die "systemctl --user is unavailable in this session (check XDG_RUNTIME_DIR / pam_systemd)"
  check_env_file
  prepare_checkout "$sha"
  run_selftest "$CHECKOUTS/$sha"
  local previous=""; [ -L "$CURRENT" ] && previous="$(git -C "$CURRENT" rev-parse HEAD 2>/dev/null || true)"
  if [ -n "$previous" ] && [ "$previous" != "$sha" ]; then echo "$previous" > "$PREVIOUS_FILE"; fi
  ln -sfn "$CHECKOUTS/$sha" "$CURRENT"
  write_unit
  systemctl --user daemon-reload
  systemctl --user enable "$UNIT_NAME" >/dev/null
  systemctl --user restart "$UNIT_NAME"
  sleep 5
  systemctl --user is-active --quiet "$UNIT_NAME" || die "service failed to start; run: $0 logs"
  log "worker running at $sha${previous:+ (previous: $previous)}"
  report_linger
}

status() {
  preflight
  [ -L "$CURRENT" ] && log "current revision: $(git -C "$CURRENT" rev-parse HEAD)" || log "no revision installed"
  [ -f "$PREVIOUS_FILE" ] && log "rollback revision: $(cat "$PREVIOUS_FILE")"
  systemctl --user --no-pager status "$UNIT_NAME" | head -n 12 || true
  report_linger
}

logs() { preflight; if [ "${1:-}" = "-f" ]; then journalctl --user -u "$UNIT_NAME" -f; else journalctl --user -u "$UNIT_NAME" -n 200 --no-pager; fi; }

rollback() {
  preflight
  [ -f "$PREVIOUS_FILE" ] || die "no previous revision recorded"
  local target; target="$(cat "$PREVIOUS_FILE")"
  [ -d "$CHECKOUTS/$target/.git" ] || die "previous checkout $target is missing"
  local current; current="$(git -C "$CURRENT" rev-parse HEAD)"
  ln -sfn "$CHECKOUTS/$target" "$CURRENT"; echo "$current" > "$PREVIOUS_FILE"
  systemctl --user restart "$UNIT_NAME"
  log "rolled back to $target (previous: $current). Note: runs are only claimed when their engine revision matches."
}

disable() {
  preflight
  systemctl --user disable --now "$UNIT_NAME" 2>/dev/null || true
  log "worker stopped and disabled. A run it held keeps its lease until expiry, then becomes reclaimable."
  log "checkouts and $ENV_FILE are left in place; delete them manually if decommissioning."
}

[ "${BASH_SOURCE[0]}" = "$0" ] || return 0  # allow sourcing for tests

case "${1:-}" in
  configure) preflight; configure ;;
  install) shift; install "${1:-}" ;;
  selftest) preflight; [ -L "$CURRENT" ] || die "nothing installed yet"; run_selftest "$CURRENT" ;;
  status) status ;;
  logs) shift; logs "${1:-}" ;;
  rollback) rollback ;;
  disable) disable ;;
  *) sed -n '2,25p' "$0"; exit 64 ;;
esac
