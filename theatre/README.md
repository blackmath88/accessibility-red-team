# Run Theatre (v1)

Live + replayable visualization of pipeline events. One HTML file, no build, no dependencies.

## Open

    python3 -m http.server 8080          # from repo root
    http://localhost:8080/theatre/theatre.html?src=runs/zh-small-pilot-2026-10-09.events.jsonl

Pass `?src=` explicitly: without it `theatre.html` falls back to the old synthetic `runs/zh-small-pilot-2026-09-26.events.jsonl`, which is no longer shipped.

URL params: `src=<jsonl>` replay a file · `live=<url>` SSE endpoint (control plane: `/api/v1/runs/<id>/theatre-events`, needs the operator Access cookie), or a growing `.jsonl` (polled every 2 s) · `tempo=0..100`.
Controls: play/pause, tempo (events per second), scrub bar (rebuilds state up to that event), `file…` loads a local log without a server.

Left panel: the **reader** shows the surface being probed as a screen reader would announce it (`<role> · <text>`, from `at.selector` / `at.snippet`), with a read trail of word chips. The **crawler** is drawn on that material; its shape comes from the element's selector path and latest probe results. `crawler · creature | instrument | off` toggles gestures (roll between pages, jolt on violations, tilt on incomplete, a balloon per finished site) and its lines. Every gesture and line is triggered by an event; the Walliserdeutsch lines live in one `SAY` table near the top of the script. Reduced motion: no rolling or jitter; scrubbing never triggers gestures.

## Feed

Events follow `events.schema.json` (`art/theatre-event/v1`), one JSON object per line. See `docs/RUN_THEATRE.md` for the contract, the verdict spaces per stage, and the build plan for emitting real events from scout/probe/triage/report/watch and from the control plane.

## Sample run

`runs/zh-small-pilot-2026-10-09.events.jsonl` is a **real** event log from

    npm run cohort -- cohorts/zh-small-pilot.yml --out runs/cohorts/zh-small-pilot

(5/5 sites, 4,793 events, every one `actor: code`; probe and triage observations carry `at` locations for the reader). `runs/zh-small-pilot-2026-10-09.summary.json` is the cohort summary from the same run; `test/theatre-acceptance.test.ts` checks the two against each other (`aiCalls` = model events).

Any CLI run with `--out <dir>` writes `<dir>/events.jsonl` (`--no-events` disables it); open it with `?src=../runs/<dir>/events.jsonl`.

`interpret` events come from the model router (`src/routing/route.ts`): violations are `explained` by template, incomplete findings are routed and, under the production policy, always land on `NO_MODEL → needs-review` with the reason in `detail`.

Not emitted yet: journeys. (Surfaces cut by the cohort `max_surfaces` cap are now emitted as scout `skipped`; the recorded run predates that.) `scripts/synth-from-baseline.mjs` still generates a shaped log from a baseline for renderer work.
