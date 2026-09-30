# Population Analytics milestone

## Goal

Turn the Observatory's private run/evidence store into a queryable research corpus before investing further in Morrow/frontier analysis.

Primary acceptance:

> An authenticated operator can export a self-contained, deterministic Solothurn population JSON with run facts and finding-level rows derived from stored `art/accessibility-report/v1` artifacts, then inspect/share that bounded export for signal-vs-noise analysis.

## Principles

- R2 remains private.
- No AI is used to build the corpus.
- Do not infer findings from artifact counts.
- Structured report artifacts are parsed defensively and skipped with an explicit diagnostic when malformed.
- Every normalized finding retains municipality/run/artifact/evidence provenance.
- Aggregates are conveniences; finding-level rows remain available so summaries can be challenged.
- Population analysis does not rank municipalities or claim conformance.

## Slice 1 — deterministic export

```
D1 cases/runs/artifacts
       +
private R2 report.json
       ↓
population indexer
       ↓
art/population-analysis/v1
       ↓
authenticated JSON endpoint
       ↓
Control Center download
       ↓
external analysis / ChatGPT
```

Include:
- population metadata and generation timestamp;
- latest terminal run per case;
- execution outcome, attempt, timing, artifact counts;
- report summary;
- finding rows: organization, property, run, report artifact hash, probe, outcome, impact, surface/state, WCAG refs, affected-node count;
- report-level applicability counts;
- diagnostics for missing/malformed report artifacts.

## Slice 2 — Observatory Analysis UI

Population summary, outcome/retry distributions, finding/probe/WCAG distributions, coverage/artifact-depth anomalies, drill-down to case/evidence.

## Slice 3 — fingerprints

Add provenance-first implementation fingerprints (CMS/vendor/framework/service/component) and correlate them with recurring finding signatures.

## Slice 4 — learning-loop evaluation

Use the frozen corpus to select representative/outlier deep missions, establish frontier/human labels, benchmark Morrow on typed semantic tasks, and compile sufficiently specified patterns into deterministic probes.

## Kill criterion

Do not justify additional AI architecture merely because a large corpus exists.

If population analysis shows mostly duplicated low-information findings, weak behavioral signal, no useful implementation clustering, and little unresolved semantic work, reduce scope rather than add Morrow/frontier complexity.
