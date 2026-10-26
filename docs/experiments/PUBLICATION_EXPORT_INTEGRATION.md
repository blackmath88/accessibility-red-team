# Publication policy at one export boundary

Date: 2026-10-26

This change connects `decidePublication` to one concrete, opt-in JSON export. It does not rewrite an existing
scan/site report, promote a probe, change outreach state, or claim that older findings have acquired trusted
publication status.

## Connected vertical slice

`npm run publication:export -- <legacy-report.json> <candidate-set.json> --authority <trusted-authority.json> --out <publication-report.json>`
calls `buildPublicationExport` in `src/report/publication.ts`.

The boundary:

1. validates an existing `art/accessibility-report/v1` or `art/site-accessibility-report/v1|v2` and verifies its
   exact SHA-256 against the trusted authority document;
2. validates a separate candidate set and trusted caller-authority document;
3. recomputes every candidate's eligibility with `decidePublication`;
4. includes only `automatic` or `reviewer_approved` assessment records;
5. rejects duplicate assessment IDs, and writes denied candidate IDs, assessment IDs where available, and policy
   reasons without echoing raw candidate records, hypotheses or model prose;
6. atomically replaces the output and refuses to overwrite any input, including through an existing symlink.

The source report is recorded as `legacy_snapshot_not_policy_evaluated`. Its existing findings remain in the
original artifact and are neither copied into the policy-approved findings nor silently upgraded. This preserves
the distinction between legacy deterministic snapshots and versioned publication assessments.

## Authority and evidence boundary

Candidate input cannot carry its own authority context. The separate authority document pins the exact source
report bytes and supplies reviewer IDs, exact accepted review-record digests, verified evidence receipts, resolved
scope, canonical assessment/observation/execution digests and (for automated candidates) current probe digests keyed
by candidate ID. A matching reviewer name without the exact digest is insufficient. Each assessment must also carry
valid claim/evidence versions, and every evidence ref must match a receipt in trusted context. Automated results
retain the stricter trusted-probe and immutable-execution requirements already enforced by `decidePublication`.
The written assessment's `publication_eligibility` is replaced with the recomputed policy decision, so a candidate's
stored label is never republished as authority.

This local CLI does not authenticate a person, verify evidence bytes, or establish secure storage. The workflow
invoking it remains responsible for provisioning the authority file and integrity receipts from trusted systems.

## Integration coverage

`test/publication-export.test.ts` exercises the file-to-file boundary. A simulated non-synthetic, exact-version
manual approval and a separately simulated trusted automated result are included; the same automated result remains
rejected while its probe entry is still a candidate. Stale and synthetic approvals, missing trusted evidence
receipts, a duplicate assessment, a raw hypothesis, changed assessment/observation/execution records and modified
source-report bytes are rejected. The test also asserts that hypothesis text is absent from the written export,
that the export cannot overwrite an input through a symlink alias, and that malformed CLI layouts exit with usage
status before any input read. All authority in these tests is explicitly simulated and is not real sign-off.

## Remaining unconnected paths

The following continue to use their existing contracts and claim classes:

- `buildReport` in `src/report/build.ts` and its HTML renderer;
- `buildSiteReport` in `src/report/site.ts`, including behavioral journey sections;
- `auditSite` in `src/site/audit.ts`;
- watch comparison in `src/watch/compare.ts`;
- cohort aggregation in `src/cohort/run.ts`;
- control-center artifact upload/serving in `scripts/control-center-runner.ts` and `cloudflare/src/worker.ts`;
- population analysis in `cloudflare/src/population-analysis.ts`;
- outreach permissions and lifecycle state.

Candidate probes and adaptive hypotheses remain internal. The skip-link entry remains a candidate and cannot pass
the automatic branch. Connecting another path requires its own legacy adapter, trusted authority source and
reviewed migration; this change deliberately does not expand into that work.
