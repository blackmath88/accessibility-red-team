# Run Theatre (v1)

Live + replayable visualization of pipeline events. One HTML file, no build, no dependencies.

## Open

    python3 -m http.server 8080          # from repo root
    http://localhost:8080/theatre/theatre.html?src=runs/zh-small-pilot-2026-09-26.events.jsonl

URL params: `src=<jsonl>` replay a file · `live=<url>` SSE endpoint, or a growing `.jsonl` (polled every 2 s) · `tempo=0..100`.
Controls: play/pause, tempo (events per second), scrub bar (rebuilds state up to that event), `file…` loads a local log without a server.

## Feed

Events follow `events.schema.json` (`art/theatre-event/v1`), one JSON object per line. See `docs/RUN_THEATRE.md` for the contract, the verdict spaces per stage, and the build plan for emitting real events from scout/probe/triage/report/watch and from the control plane.

## Sample run

`runs/zh-small-pilot-2026-09-26.events.jsonl` is **synthesized** from the real cohort baseline (`benchmarks/baselines/zh-small-pilot-2026-09-26.json`): site, surface, finding, needs-review and issue-family counts are real; per-event ordering and timing are generated (`scripts/synth-from-baseline.mjs`). Replace it with a real `events.jsonl` as soon as the emitter lands — the renderer does not change.
