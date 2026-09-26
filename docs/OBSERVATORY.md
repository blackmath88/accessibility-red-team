# Project Observatory

This repository uses [Observstory](https://github.com/blackmath88/observstory) as a repository-level control room for the Accessibility Red Team build.

## What it observes

Observstory derives project state from GitHub activity:

- open pull requests;
- unmerged branches;
- direct pushes;
- issues;
- path overlap;
- stale work;
- waiting/dependency signals;
- machine-paced commit bursts.

It does **not** replace the accessibility observatory data model. Accessibility findings, municipality cohorts, WATCH results and candidate checks remain domain artifacts in this repository.

The separation is intentional:

```text
Observstory
repository / collaboration state
        +
Accessibility Red Team
domain evidence / field-validation state
```

## Project lanes

The map is configured around the architecture of this build:

1. Intent & Governance
2. Scout & Capture
3. Probe & Journey
4. Evidence & Report
5. Validate & Learn
6. Automation

## Declared build state

`.observstory/coordination.json` carries a small set of manually declared commitments and decisions.

It is deliberately not a task board. Repository evidence determines what work is actually moving.

Current declared direction:

- validate safe journeys on the existing Zürich cohort before adding geography;
- close the candidate → fixture → promote/reject learning loop;
- keep outreach disabled until the validation program reaches the appropriate gate;
- preserve minimum-AI architecture and explicit municipal provenance uncertainty.

## Where to see it

The `Observstory` GitHub Action runs on pushes, PR/issue changes, hourly reconciliation and manual dispatch.

Download the workflow artifact:

`accessibility-red-team-observatory`

and open:

- `index.html` — Project Map
- `radar.html` — alternate radar view
- `data/snapshot.json` — typed project state for tools/agents
- `data/scene.json` — compiled visual scene

## Why artifact-first

The repository is public, so GitHub Pages is possible later. For the first framework test we keep the observatory as a workflow artifact until we have inspected the real output and decided whether a permanently hosted project map is useful.
