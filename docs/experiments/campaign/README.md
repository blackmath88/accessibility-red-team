# Experimental autonomous campaign (local rehearsal)

First vertical slice of [the campaign build handoff](../AUTONOMOUS_CAMPAIGN_BUILD_HANDOFF.md). One command starts a
local campaign that runs unattended. Claude makes the strategy, triage, probe-design and conclusion decisions over
compact evidence packets; software enforces scope, invocations, wall time, concurrency, the probe gate and settlement.
Local fixtures only. No public-site requests and no paid API route.

## Operate

```bash
npm run campaign:cli -- start docs/experiments/campaign/rehearsal.config.json
```

```bash
npm run campaign:cli -- status rehearsal-1
```

```bash
npm run campaign:cli -- extend rehearsal-1 --invocations 6 --reason "why more is justified"
```

```bash
npm run campaign:cli -- resume rehearsal-1
```

```bash
npm run campaign:cli -- stop rehearsal-1
```

```bash
npm run campaign:ui
```

The dashboard is the existing control center: `http://localhost:5180/` → Investigations workspace → **Live campaign**.
It polls a read-only dev/preview adapter (`/campaign-api/…`) every 2.5 s. Stopping the dashboard does not stop the
campaign; reconnecting restores the view from the persisted state.

`start` refuses an existing campaign ID. `extend` only raises the invocation or wall-time ceilings, never below
consumption, and only while no controller is running. It keeps scope, model, token target and paid authority unchanged
and appends a `budget_amended` event with the previous and new ceilings and the reason. `resume` continues the same
campaign from its checkpoint: consumed usage, completed tasks and evidence are kept; tasks interrupted mid-run are
re-queued, and an investigation continues from its last completed sub-step.

## What runs

| Milestone | Work | Who decides |
|---|---|---|
| 1. Understand scope | validate the versioned config, hash every fixture and cached-evidence file | software |
| 2. Set strategy | choose which page/viewport units to measure and in what order | Claude (1 invocation) |
| 3. Discover and assess | fixed algorithmic baseline probe through the broker sandbox, ≤ 2 in parallel | software |
| 4. Investigate signals | triage every signal: open an investigation or reject with a reason; then design, gate, execute and conclude via `transfer.ts` | Claude (triage 1; per investigation 2–3) |
| 5. Reproduce and consolidate | fresh broker replay of the flagged page and its control | software |
| 6. Deliver dossier | deterministic report from stored facts; partial on any checkpoint | software |

State lives in `runs/campaign/<id>/` (gitignored): `config.json` plus `config-history.jsonl`, append-only
`events.jsonl` (operational and decision events with stable IDs), atomic `state.json` (projection and checkpoint),
`evidence/`, `claude/` (every prompt and raw result), `report.md`, `controller.log`. Investigations write to
`runs/ail-transfer/<campaign>-inv-N/`, using the same gate, freeze rules and run lock as the blind transfer cases.

## Resources

- **Enforced:** Claude invocations (reserved before each call, consumed whether it succeeds or not; in-flight calls
  count), wall time (active controller time summed across sessions), concurrency (≤ 2, hard-coded cap). The last 20 %
  of invocations are reserved for finishing open work: no new investigation is designed past that threshold.
- **Measured, not enforced:** tokens. Each `claude -p --output-format json` result reports `usage` (input,
  cache creation, cache read, output, thinking); the controller sums it per call and shows "unknown" when a call
  reports none. The installed CLI (2.1.295) has no per-call output-token flag, so the 500k/60k figures stay a target.
- **Claude route:** `claude -p --model claude-opus-5-5 --tools "" --strict-mcp-config --no-session-persistence
  --output-format json`, from an empty directory under the campaign folder. Subscription routing; no API key. Each call
  is one model turn without tools.
- **Exhaustion:** the controller settles running Claude processes, saves a partial report and checkpoints with status
  `budget_exhausted`. Scope or sandbox failures fence the campaign; more budget is not accepted as a fix there.

## Rehearsal record

See [rehearsal.md](rehearsal.md).
