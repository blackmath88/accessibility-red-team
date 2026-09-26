# Observstory field-eval baseline — 2026-09-26

First consumer-side field evaluation of Observstory inside Accessibility Red Team.

Source run:

https://github.com/blackmath88/accessibility-red-team/actions/runs/36237340709

## Result

```text
PASS        8
WARN        1
INFO        1
FAIL        0
CANDIDATES  2
HEALTHY     true
```

## Healthy checks

- typed snapshot contract;
- all six project lanes present;
- no degraded collection;
- API budget inside project threshold (105 / 160);
- declared coordination present;
- every signal retains evidence + rule provenance;
- `summary.in_flight` is internally consistent;
- fresh commitments are no longer retroactively reconciled as landed.

## Field findings

### Candidate 1 — fallback explainability

Fallback lane still contains:

- `scripts`
- `src`

The evaluator does not treat this as a framework failure. It creates an improvement candidate because external users need to understand *why* an area fell through semantic lane configuration.

### Candidate 2 — direct-to-main activity semantics

Observed:

```text
summary.in_flight = 0
direct stream      = direct:blackmath88
burst              = burst:direct:blackmath88
```

The model is internally correct, but the first-read semantics can be misleading for a highly active direct-to-main repository.

## Cadence

Future runs are:

- manual;
- weekly.

No hourly meta-evaluation.

Each run produces:

- fresh Observstory artifact;
- `observstory-eval/eval.json`;
- `observstory-eval/report.md`.

Recurring candidates can be promoted into upstream framework work after review.
