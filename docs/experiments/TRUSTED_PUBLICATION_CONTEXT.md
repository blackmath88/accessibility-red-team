# Local evidence integrity for publication export

Date: 2026-10-26

This stacked slice connects actual local artifact bytes to the publication export without pretending that a JSON
file authenticates a reviewer. It is intentionally integrity-only until an authenticated reviewer service exists.

## Reused capabilities and boundary

The control-center runner already hashes artifact bytes before upload, and the R2 adapter stores content-addressed
objects with an R2 SHA-256 checksum. Those paths remain unchanged. They depend on deployed Cloudflare Access, R2
and D1 state, so this local slice does not claim to reproduce their identity guarantees.

`npm run publication:export-local -- <legacy-report.json> <candidate-set.json> --bindings
<local-evidence-bindings.json> --evidence-root <dir> --out <publication-report.json>` performs a local, offline
integrity check:

1. parses the candidate assessments and collects their exact evidence refs;
2. resolves every binding beneath the real evidence-root path, refusing a symlink or traversal outside it;
3. reads each regular file and recomputes SHA-256 over its actual bytes;
4. refuses missing bindings, conflicting expected hashes and changed bytes before issuing an in-memory receipt;
5. binds assessment, observation and execution records by canonical digest and feeds that context directly into
   the existing publication exporter, without an editable intermediate authority file;
6. supplies no reviewer IDs, no review digests and no positive applicability decision.

The resulting authority ID is `local-integrity-only:review-authority-unavailable`. Its scope is deliberately
`applicable: false`, because candidate/model-controlled records may name a subject and obligation but cannot decide
their applicability. The export therefore remains fail-closed: verified bytes alone cannot publish a finding.

The bindings document is a locator, not authority. Changing a path cannot authorize publication, and a binding is
accepted only when the bytes at its resolved in-root path match the SHA-256 already bound into the assessment.

## Reviewer approval boundary

No repository-local secure reviewer identity is available. The existing Cloudflare Access operator authentication
establishes an email for deployed control-center requests, but the current operator schema has no review permission,
no append-only adjudication receipt, and no endpoint that binds an authenticated operator to exact assessment,
claim, evidence and probe versions. An editable authority JSON therefore remains unsuitable as proof of sign-off.

The unimplemented dependency is a narrowly scoped authenticated review-receipt service (not a general identity
platform): it must derive reviewer identity from authentication outside candidate/model input, authorize a dedicated
review capability, force `synthetic: false` server-side only for a real decision, and bind the complete review record
to the exact source report, assessment ID, claim version, evidence version and probe digests. Until that exists,
local production use has no approval path and cannot emit `reviewer_approved` or `automatic` findings.

Tests exercise an explicitly simulated programmatic authority to prove the verified receipts can feed the existing
export once such a service exists. That fixture is labelled test-only and is not exposed by the local CLI.

## Checks and exclusions

Coverage includes matching bytes, modified bytes, missing/conflicting bindings, symlink escape, fail-closed export,
and the explicitly simulated future approval path. The skip-link probe remains a candidate. This slice does not add
DOs, deploy anything, promote probes, contact public sites, migrate report/watch callers, or manufacture sign-off.

