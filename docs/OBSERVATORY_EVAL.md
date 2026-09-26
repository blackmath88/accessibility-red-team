# Observstory field evaluation

The repository dogfoods Observstory as a build observatory and evaluates the framework itself on a **weekly/manual** cadence.

This is intentionally slower than the normal event-driven observatory.

## Why

The normal Observstory workflow answers:

> What is the project state now?

The field eval answers:

> Is Observstory representing this real project clearly, cheaply and with evidence?

## Inputs

- a fresh Observstory snapshot;
- `.observstory/eval.json` with project expectations.

## Checks

The first contract evaluates:

- snapshot schema;
- presence of the six project-specific lanes;
- fallback-lane pressure;
- degraded collection;
- API-call budget;
- declared coordination presence;
- evidence/rule provenance on every signal;
- summary consistency;
- direct-to-main activity semantics;
- bootstrap/retroactive coordination behavior.

## Outputs

`observstory-eval/eval.json`

Machine-readable checks and improvement candidates.

`observstory-eval/report.md`

Human-readable field-test report.

The workflow uploads the fresh Observatory plus the evaluation artifact for 30 days.

## Cadence

- manual dispatch at any time;
- weekly scheduled field evaluation.

It does **not** run hourly or on every push.

## Self-improvement boundary

The evaluator may generate a framework candidate such as:

```text
CANDIDATE:
Distinguish unmerged in-flight work from active landed streams
```

It does not automatically modify Observstory.

Candidates are reviewed and, when useful/reproducible, fed upstream to the Observstory repository.

This mirrors the Accessibility Red Team learning model:

```text
field evidence
→ evaluation
→ candidate
→ upstream validation
→ framework change
→ replay
```
