# Local evidence integrity for publication export

Date: 2026-10-26

This stacked slice connects actual local artifact bytes to the publication export without pretending that a JSON
file authenticates a reviewer. The follow-on local signing boundary is documented in
[`LOCAL_REVIEW_APPROVAL.md`](LOCAL_REVIEW_APPROVAL.md).

## Reused capabilities and boundary

The control-center runner already hashes artifact bytes before upload, and the R2 adapter stores content-addressed
objects with an R2 SHA-256 checksum. Those paths remain unchanged. They depend on deployed Cloudflare Access, R2
and D1 state, so this local slice does not claim to reproduce their identity guarantees.

`npm run publication:export-local -- <legacy-report.json> <candidate-set.json> --bindings
<local-evidence-bindings.json> --evidence-root <dir> --out <publication-report.json>` performs a local, offline
integrity check:

1. parses the candidate assessments and collects their exact evidence refs;
2. resolves every binding beneath the real evidence-root path, refusing a symlink or traversal outside it;
3. opens each artifact once with no final symlink following, verifies the same file descriptor is a regular file no
   larger than 25 MiB, and recomputes SHA-256 over the bytes read from that descriptor;
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

The integrity-only command still supplies no reviewer authority. A separate opt-in local workflow now uses a
reviewer-held SSH key and operator-controlled `allowed_signers` configuration to bind an intentional signature to
the exact report, assessment, observation/execution, claim, evidence and probe versions. It feeds the verified
adjudication and these actual-byte receipts directly into the same exporter. It does not add a Cloudflare service,
authorize automated probes or rely on an editable JSON assertion of identity.

Tests exercise an explicitly simulated programmatic authority to prove the verified receipts can feed the existing
export once such a service exists. That fixture is labelled test-only and is not exposed by the local CLI.

## Checks and exclusions

Coverage includes matching bytes, modified bytes, missing/conflicting bindings, symlink escape, fail-closed export,
and the explicitly simulated future approval path. The skip-link probe remains a candidate. This slice does not add
DOs, deploy anything, promote probes, contact public sites, migrate report/watch callers, or manufacture sign-off.
