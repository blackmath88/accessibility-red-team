# Accessibility Control Center

The existing React operator surface for organizations, deterministic assessments, evidence and run theatre now includes a **Basel investigation workspace**.

## Run locally

```sh
cd control-center
npm ci
npm run dev
# production build:
npm run build
```

Open the URL printed by Vite. Serving this source directory with plain Python does not compile the TSX application.

## Basel workspace

Investigations is the default view. It contains:

- Overview: recorded scope, the next Adaptive Investigation Loop milestone, and the algorithmic/Mistral fixture comparison with its limits.
- Scope: the 25-service sample, search by service/office, and the 11 linked hosts that have not been assessed.
- Investigations: the faint hint, focus-tool false alarm and search-widget concern, with competing explanations, evidence links and pending work.
- Evidence: document-load accounting, pinned source/code revisions and the boundary between observations, judgments and publication approval.

The workspace imports the committed discovery and field-result JSON at build time. It remains usable if the operational API is unavailable. It is a read-only research snapshot, not a live feed, mission dispatcher or publication exporter. No generated probe or AI incremental-value result is fabricated.

Organizations, Runs, Review, Reports, Outreach and the existing theatre remain available. Existing operational actions retain their existing authenticated API boundary; this change does not invoke those actions.

See [the upgrade note](../docs/experiments/BASEL_INVESTIGATION_WORKSPACE.md) for provenance, checks and the next implementation seam.
