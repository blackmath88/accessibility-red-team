# Accessibility Control Center

First operational UI slice for accessibility-red-team.

## Product boundary

The durable subject is an **Organization**. Municipality is the first supported organization type and current UI vocabulary.

Organizations own digital properties. Accessibility assessment/remediation cycles are cases. The control center is the operator surface; accessibility-red-team remains the assessment engine.

## Current slice

Working: organization-general schema, municipality seed portfolio, searchable/filterable portfolio, organization/case detail, probe catalogue, workflow/outreach placeholders.

Intentionally not faked: durable run queue, scan execution API, artifact ingestion, email sending, authentication. Buttons requiring those capabilities remain disabled.

## Local

Serve the repository root and open /control-center/.

    python3 -m http.server 8080

## Next

Define Run + Artifact contracts, ingest real field-summary artifacts, add durable job adapter, wire assessment actions, then generate report/outreach drafts with human approval before sending.
