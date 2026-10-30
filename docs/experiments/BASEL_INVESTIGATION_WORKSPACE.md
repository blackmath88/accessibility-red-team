# Basel investigation workspace — first upgrade

Status: implemented read-only UI slice; adaptive execution is still pending.

## What was found

The owner-linked `blackmath88/development-practice` at `f83d29c0e8ee00cf69202b2a176682514b1703a6` is a Markdown development-practice repository, not the Solothurn application. Its baseline and prototype approach informed this change; no practice files or skills were installed or amended.

The existing application is in `control-center/` in this repository. Source inspection found a React/Vite UI, organization/case queues, authenticated run APIs, evidence/report views, a Solothurn-specific population export, and a separate event theatre. These are code observations, not evidence that a deployed service or Nebu runner is currently reachable.

Reuse those capabilities. Add an investigation view, not another runtime, database or governance service.

## Delivered slice

`control-center/src/InvestigationWorkspace.tsx` reads the existing committed inventory and field-result JSON. It adds overview, scope, investigations and evidence sections to the existing navigation, including mobile navigation. Basel is the default view; existing operational views remain available.

The three cases distinguish:

1. A reproduced faint hint with unconfirmed explanation — next dynamic probe-design experiment.
2. A focus-visibility false alarm — a tool improvement, not a Basel finding.
3. A search-widget markup concern — impact requires stateful and assistive-technology testing.

The pending experiment loop is labelled as a plan. It does not animate invented events, imply that generated probes already exist, or label a model judgment as human acceptance. The previous A/M comparison is explicitly a synthetic-fixture result and cannot be read as Basel recall.

Existing sidebar wording that universally claimed zero AI calls has been replaced with neutral wording. Individual deterministic report facts remain unchanged.

## Provenance

- Field report snapshot: PR #53 head `7f1b02fb353e47c9b6e4e1e8ae8a2b0495d4ff11`.
- Field execution code: the `codeSha` in imported `field-results.json`.
- Inventory: existing `docs/experiments/basel-discovery/discovery-data.json` carried by PR #54 / #55, with per-entry source metadata.
- Next milestone: PR #55 head `32e67f2d4c56198fa5902426cfab4e373a7d0585`.
- Evidence links point to immutable GitHub revisions. Raw private archives and credentials are not exposed.
- 64 means top-level document/navigation loads, including failed replay attempts; it is not a count of all HTTP requests.

## Responsibility boundaries

| Layer | Responsibility |
| --- | --- |
| Weavr | Governed mission intent, needs and permitted next actions |
| Orca / verified local coordinator | Actual worker lifecycle, routing and settlement |
| Experimental investigation runner | Enforced target/budget boundary, probe execution, measurements and provenance |
| Existing assessment API | Existing authenticated deterministic case/run operations |
| Investigation workspace | Read-only presentation of recorded scope, questions, evidence and incremental value |
| Publication exporter | Existing separate signed approval and evidence policy |

No Weavr mission was created or dispatched. The inspected Weavr snapshot had no accessibility-red-team project and no eligible online runner. That does not prove Nebu itself is offline; it means this connection cannot establish or dispatch that runtime.

## Next useful slice — actual M1 evidence

Complete the bounded M1 experiment in the existing milestone before building live controls. Then add a small validated read-only investigation bundle assembled from its real artifacts: investigation ID, source/code revision, exact target, hypotheses, generated-probe hashes, execution/countertest/replay receipts, judgments, timing/cost and baseline-versus-added evidence.

Use existing event/theatre infrastructure where its semantics fit. Do not force proposed stages into observed events or rewrite the stable theatre contract merely for UI motion. Unknown/stale/missing evidence stays explicit. A bundle import can precede live streaming. No new server or dependency is justified for this first slice.

Only later, if useful, expose an authenticated governed command that references an existing bounded experiment contract. A browser view must never authorize arbitrary code, broaden target scope, create trusted probe status or bypass publication policy.

## Validation and limits

- `npm ci --ignore-scripts --no-audit --no-fund` and `npm run build` in `control-center/`: passed locally.
- Ephemeral jsdom interaction checks passed for the default view, case switching, 25-row inventory, empty search results, evidence view, original navigation and API-failure isolation. These are DOM checks, not real-browser tests; no new test dependency was added.
- Full root engine suite: not run; this slice changes UI and documentation only.
- No field requests, paid model calls, public-site scans, deployment or merges.
- Independent review not performed.
- Browser visual/accessibility QA remains pending: the local Playwright browser download returned invalid archives. DOM checks are not a substitute for viewport, keyboard, contrast or screen-reader verification.
