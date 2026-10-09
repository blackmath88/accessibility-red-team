# Run Theatre

Status: **v1 drop-in / build brief**
Scope: live and replayable visualization of what the pipeline does in the background.

## Why

The product thesis is *minimum AI*: deterministic code owns discovery, probes, provenance,
verification and comparison; AI only touches bounded semantic boundaries. That thesis is
currently only visible in `manifest.json` (`aiCalls: 0`) and in docs. The theatre makes it
visible while it happens: every observation that code dropped, every finding that reached a
human, every claim VERIFY blocked.

It is a scene over an event stream — not a dashboard over tables. Replay and live are the
same renderer with two feeds.

## Boundary

- Pipelines emit events. They never import the theatre.
- The theatre consumes events. It never reads `report.json`, D1 or R2 directly.
- The control center stays the operator surface (CRUD, approvals). The theatre is a view.

## Event contract (`theatre/events.schema.json`)

One JSON object per line (JSONL), append-only, ordered by `ts`.

```jsonc
{
  "ts": "2026-09-26T08:12:03.411Z",
  "run": "zh-small-pilot-2026-09-26",
  "stage": "probe",                  // run|scout|probe|triage|interpret|verify|report|watch
  "actor": "code",                   // code|small-model|large-model|human
  "subject": { "kind": "observation", "id": "ossingen/s2/axe.region#14", "site": "ch-zh-ossingen" },
  "verdict": "violation",            // stage-specific small decision space, see below
  "detail": "axe.region · 14 nodes outside landmarks",   // optional, one line, human-readable
  "cost": { "ms": 180 }              // optional: ms, usd, tokens
}
```

Verdict spaces (keep them small — this is the "typed decision space" principle applied to telemetry):

| stage     | subject.kind | verdicts |
|-----------|--------------|----------|
| run       | run          | start, end, partial, cancelled |
| scout     | site/surface | discovered, selected, skipped |
| probe     | surface/observation | pass, violation, incomplete, inapplicable, blocked |
| triage    | observation/finding | merged, finding, dropped |
| interpret | finding      | explained, needs-review, escalated |
| verify    | claim        | supported, blocked |
| report    | site         | written |
| watch     | finding      | new, persisting, resolved, rule-changed, not-comparable |

Rules: `actor` is who decided, not who executed (axe running under Playwright is `code`).
A model call always carries `cost.tokens` or `cost.usd`. A human decision is only emitted when a
human actually acted (approval in the control center), never pre-emptively.

## Files in this drop

```
theatre/
  README.md                      how to open, feeds, URL params
  events.schema.json             the contract above (JSON Schema, strict)
  theatre.html                   single-file renderer, no build step, no deps
  scripts/synth-from-baseline.mjs  expands a cohort baseline into a shaped event log (dev only)
  runs/zh-small-pilot-2026-10-09.events.jsonl   real cohort run (+ .summary.json)
docs/RUN_THEATRE.md              this file
```

`theatre.html` works standalone: `python3 -m http.server 8080` in repo root → `/theatre/theatre.html?src=runs/zh-small-pilot-2026-10-09.events.jsonl`.

## Build plan for Claude Code

Keep every step independently shippable. No step may change pipeline outputs or add an LLM call.

### 1. Emitter (`src/theatre/emit.ts`) — ~60 lines
- `createEmitter({ run, sink })` returning `emit(event)`; sinks: `jsonlFile(path)` (append), `stdout`, `noop`.
- Validate against `events.schema.json` with zod in dev, skip in prod.
- Default sink when `--out <dir>` is given to any CLI: `<out>/events.jsonl`. Add `--no-events` to disable.
- Test: emits valid lines, ordering preserved, never throws into the pipeline (log + continue).

### 2. Instrument stages — one PR per stage, smallest first
- `src/scout/scout.ts`: `discovered` per page, `selected`/`skipped` per surface with `detail = kind + strategy`.
- `src/scan.ts` / `src/journeys/engine.ts`: per axe result node → `observation` with outcome; journeys → `surface` with `pass|blocked|inapplicable`.
- `src/triage/triage.ts`: `merged` per occurrence folded into an existing finding, `finding` when a new finding is created, `dropped` for filtered noise. `detail = probeId · templateLeverage`.
- `src/report/build.ts`: `verify` events for each provenance claim (`supported` when a profile source resolves, `blocked` when it does not), then `report.written` per site.
- `src/watch/compare.ts`: one event per finding with the lifecycle state as verdict.
- Semantic compiler path (`src/evaluation/semantic-experiment.ts`): `interpret` with `actor: small-model`, cost in tokens. This is the only place a non-`code` actor appears today.

### 3. Live feed from the control plane
- Worker: `GET /api/runs/:id/events` as SSE, backed by a new `run_events` D1 table (append-only, same shape; migration `0003_run_events.sql`). Lease renewals already carry stage/progress — map them to `run` events so a run shows motion even before fine-grained events arrive.
- Nebuchadnezzar worker: ship `events.jsonl` as an artifact at completion **and** stream batches (every 2 s or 50 events) through the existing renew call. Outbound only, no new inbound route.
- Theatre: `?live=https://…/api/runs/<id>/events` uses `EventSource`; `?src=` stays for files.

**Implemented** (deviations from the plan above):
- Table is `theatre_events` (migration `0003_theatre_events.sql`), not `run_events`: that name is already the operational log (stage/throttle/backoff/lease). Rows are `(id AUTOINCREMENT, run_id, event_json, received_at)`, append-only; `id` is the SSE `Last-Event-ID`.
- Ingest is a dedicated `POST /api/v1/runs/:id/theatre-events` (`{ events: [1..200] }`, runner + lease auth, whole batch rejected with 400 on any invalid event or `run` mismatch), not piggybacked on lease renew, because renew writes a lease row on every call. The runner posts batches of <= 50 every 2 s and flushes once more before artifact upload; failures are logged and never fail the run, and `events.jsonl` is still uploaded as an artifact.
- Control-plane lifecycle is synthesized as `run` events (claim -> `start`, complete -> `end`/`partial`, fail -> `partial` + error, cancel -> `cancelled`), so a run moves before fine-grained events arrive.
- Read is `GET /api/v1/runs/:id/theatre-events` (operator read; Access cookie, since `EventSource` cannot set headers). With `Accept: text/event-stream` it streams rows after `Last-Event-ID`/`?after=`, polling D1 every 2 s for a 25 s window, then closes and the browser reconnects; otherwise it returns NDJSON.

### 4. Cohort scene
- One run = one cohort. Sites appear on the arc in cohort order; coverage grid = sites × surfaces.
- Add a "Theatre" link per Run in the control center (`control-center/src/main.tsx`), opening `theatre.html?live=…` while running and `?src=<artifact url>` after.

### 5. Non-goals for v1
No auth in the theatre (it reads a URL the control center hands it with the operator's Access JWT cookie).
No persistence of UI state. No React. No charting library.

## Acceptance
- A cohort run with `--out` produces `events.jsonl`; `aiCalls` in the manifest equals the count of events with `actor != code && actor != human`.
- `theatre.html?src=` replays a real `events.jsonl` with no code change compared to the synthesized one.
- During a live Nebuchadnezzar run the theatre shows events with < 5 s delay.
