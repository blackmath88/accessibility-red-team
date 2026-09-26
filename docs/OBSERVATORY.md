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


## First live run

First successful external-repo run:

- GitHub Actions run: https://github.com/blackmath88/accessibility-red-team/actions/runs/36235833257
- refined run: https://github.com/blackmath88/accessibility-red-team/actions/runs/36235923780
- artifact: `accessibility-red-team-observatory`

Observed state:

```text
in_flight         0
active areas      23
commits/window    100
overlap           0
stale             0
waiting           0
burst             1
degraded          0
```

The burst signal correctly identified the rapid direct-to-main build stream.

The refined project map now places work into:

```text
Intent & Governance
Scout & Capture
Probe & Journey
Evidence & Report
Validate & Learn
Automation
```

with only the mixed root `src` area remaining in the fallback `Other` lane.

Current declared commitments reconcile as `not_started`:

1. candidate promotion + regression-fixture harness;
2. journey-gap fixtures before outreach use;
3. canton-scale shadow cohort only after promotion gates work.

## Observstory dogfood feedback

This integration is also a framework test for Observstory.

Feedback from the first external-repository run is tracked upstream:

https://github.com/blackmath88/observstory/issues/13

Key findings:

- strong typed snapshot / UI separation;
- useful custom lane model;
- declared + observed coordination is valuable;
- direct-to-main activity can look contradictory with `summary.in_flight = 0`;
- custom-lane fallback would benefit from better explainability;
- long-running builds could use a lightweight current-focus primitive without inventing a deadline;
- API cost is visible when `max_commits` is high.
