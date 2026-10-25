# Packet C — evidence, adjudication and publication contracts

This is a bounded internal policy slice, not a production publication migration.
The shipped skip-link entry remains **candidate**, with no real reviewer approval.
Outreach eligibility did not change. No AI, public scan, message, deployment or
network service is invoked by these policy functions or synthetic examples.

## Separate records and independent assessment fields

`src/evidence/contracts.ts` defines strict, versioned Zod records. Parsed records,
nested objects and arrays are frozen and their TypeScript types are readonly.
Changes produce new snapshots; the original record is not modified. This does
not enforce append-only storage, artifact retention or access control: no storage
service or migration is implemented in this packet.

| Record | Identity and responsibility |
| --- | --- |
| `ProbeExecution` (`art/probe-execution/v1`) | Immutable execution ID, subject/obligation, probe ID, implementation version, entry/implementation digests, one of the existing five JourneyOutcomes, evidence refs and SHA-256, browser/runtime environment, executedAt, provenance and tool author |
| `AssessmentResult` (`art/assessment-result/v1`) | Separate assessment ID linked to an execution and/or reproduced observation, precise claim, claim/evidence version digests, outcome, evidence/environment identity and the three assessment axes |
| `Hypothesis` (`art/hypothesis/v1`) | Source, suspected barrier, falsifying test, subject/obligation, creation time and author; no finding or publication authority |
| `ReproducedObservation` (`art/reproduced-observation/v1`) | Hypothesis link, observation/context IDs, fresh-context status, subject/obligation, timestamp and integrity-addressed evidence |
| `HumanAdjudication` (`art/human-adjudication/v1`) | Reviewer ID, human author, decision/time, exact assessment ID and claim/evidence digests, synthetic flag and note |
| `FindingCase` (`art/finding-case/v1`) | Stable case ID and obligation identity, linked assessment/adjudication/retest IDs and longitudinal disposition |
| `CaseRetest` (`art/case-retest/v1`) | Distinct completed/skipped/blocked execution status and optional assessment; these are not extra JourneyOutcomes |

Manual/assisted assessments can have null probe and execution identities, allowing
a reproduced human-reviewed barrier without an automatable detector. The shared
`JourneyOutcomeSchema` is imported unchanged. Hypothesis sources and provenance
status reuse `CandidateCheck` vocabulary: evidence provenance `KNOWN` means its
source is established, not that a WCAG/legal requirement is applicable.

These assessment axes are independently represented, not aliases or automatic
state transitions:

| Field | Values |
| --- | --- |
| `assessment_mode` | automated, manual, assisted |
| `verification` | unreviewed, replay_verified, human_adjudicated |
| `publication_eligibility` | internal_only, reviewer_approved, automatic |

The stored eligibility value is descriptive only. `decidePublication` recomputes
its decision from evidence and authority; setting a field to `automatic` cannot
make a record publishable. Human review of a manual/assisted barrier can produce
`reviewer_approved`, never `automatic`.

## Digest and authority boundaries

Evidence references contain artifact locator and lowercase SHA-256. The evidence
version hashes the canonical reference list, including every locator and digest.
The claim version hashes assessment ID, subject, obligation, probe/version/digests,
outcome and claim text. Object keys are recursively sorted; array order is part
of the reviewed version. Changing the claim, evidence bytes/ref list or detector
identity invalidates a prior adjudication. A full review-record digest also binds
reviewer identity, author, decision/time, note and synthetic flag.

Pure policy cannot read artifact bytes or authenticate a person. Its trusted
caller context must supply:

- `verifiedEvidenceRefs`: exact ref/digest receipts from an integrity verifier;
- `authorizedReviewerIds`: reviewer identities authorized by the real workflow;
- `authorizedReviewDigests`: full exact review-record digests accepted by that
  workflow, for both probe reviews and finding adjudications;
- `scope`: the applicable subject and obligation, resolved by the caller;
- current probe digests and linked execution/observation records where relevant.

A record's own `integrity: verified` label is insufficient without a matching
caller receipt. A recognized reviewer name is insufficient without the exact
accepted review-record digest. Model-authored records and records without a
reviewer ID cannot serve as human adjudication; the strict schema requires a
human author whose ID equals the reviewer ID. Copying an authorized identity
while altering a review record fails its receipt check. A caller which supplies
fabricated receipts is outside this function's trust boundary; no authentication,
signature-verification or artifact-verification service is claimed here.

## Publication policy

`src/evidence/policy.ts` has no I/O, clock, environment access or mutation. It
returns `{eligibility, reasons[]}` and defaults to `internal_only` when conditions
are not met. It does not schedule work, persist an approval or publish a report.

| Input or condition | Decision |
| --- | --- |
| Raw hypothesis, raw observation, model prose, malformed assessment | internal_only; review required |
| pass, incomplete, inapplicable or error | internal_only; does not establish a finding |
| Missing evidence, unknown provenance, unverified/mismatching integrity, missing receipt, stale claim/evidence version | internal_only |
| Scope inapplicable or subject/obligation mismatch | internal_only |
| Automated violation with candidate, experimental or retired entry, no review, synthetic or stale probe approval | internal_only; review required |
| Automated violation with trusted entry and `isTrustedEligible` matching current digests, authorized exact review receipt, matching probe/version and exact reviewed claim-template text, system-authored execution, verified evidence, non-unreviewed verification and applicable scope | automatic |
| Manual/assisted violation without matching fresh-context reproduction or human adjudication | internal_only; review required |
| Synthetic, model-authored, missing, unrecognized or stale finding adjudication | internal_only |
| Reproduced manual/assisted violation with verified evidence, applicable scope, human_adjudicated verification and authorized non-synthetic approve_finding bound to exact assessment/claim/evidence | reviewer_approved |

A probe review approves reusable detector knowledge. A human finding adjudication
approves a specific claim and evidence. These are separate authorities; neither
a raw model claim nor a passing fixture gate replaces either review.

## Packet B repair (separate commit)

The prerequisite repair is commit `ace766e0a60c91d2254cb38132ea9eef2d1060ec`.
`evaluateGate` now includes a binding to probe identity, entry/implementation
digests and the validation-record digest. `applyReviewerDecision` requires the
eligible result plus that validation record and recomputes the gate for the
current inputs before applying `approve_trusted`. A missing, ineligible, fabricated
or stale gate returns `not applied: validation gate not eligible_for_review`.
Synthetic records still return `not applied: synthetic reviewer record`.
A non-synthetic matching `reject` retires the entry; `needs_changes` keeps it
candidate. The gate itself still never changes maturity.

## Case resolution

`src/evidence/cases.ts` returns a new case snapshot; previous IDs and snapshots
remain available to a future append-only store. A completed retest can resolve a
case only when it tests the same subject, obligation and probe with the same or
explicitly compatible implementation version, reports `pass`, and has valid,
version-consistent evidence provenance from a non-unreviewed, system-authored
automated assessment linked to a tool execution. Version compatibility defaults to exact
equality; optional directional pairs are trusted policy configuration, not inferred
from semver or asserted by a model/retest record.

| Retest | New disposition |
| --- | --- |
| Missing, skipped, blocked or no assessment | not_retested |
| Different subject/obligation/probe, absent detector identity or incompatible implementation version | non_comparable |
| Comparable completed violation/incomplete/inapplicable/error or pass without valid evidence | unresolved |
| Comparable completed evidenced pass | resolved |

`not_retested` and `non_comparable` remain distinct. Absence from a sample, a
blocked task, or an omitted sibling cannot resolve a case. Manual barriers with
no detector identity are retained; this comparator does not infer their resolution.
The function does not change existing watch comparison behavior.

## Synthetic examples and validation

Every `docs/experiments/samples/evidence-*.json` is synthetic and validated against
its specific schema in `test/evidence-contracts.test.ts`:

- `evidence-hypothesis.json`: model-proposed suspected skip-link barrier;
- `evidence-observation.json`: linked fresh-context reproduction metadata;
- `evidence-execution.json`: synthetic deterministic execution identity;
- `evidence-automated-assessment.json`: candidate automated violation;
- `evidence-assisted-assessment.json`: separate assisted barrier assessment;
- `evidence-adjudication.json`: explicitly synthetic human-review example;
- `evidence-case.json`: stable longitudinal case;
- `evidence-retest.json`: skipped retest, without an outcome being invented.

The refs use `synthetic://`; no actual evidence artifact, integrity verification,
reviewer session or human sign-off is represented. Unit tests supply mock trusted
receipts and simulate `synthetic: false` records to test positive policy branches.
The committed adjudication has `synthetic: true` and is denied even with a mock
receipt. A separate test shows reviewer_approved only after simulating both a
non-synthetic human decision and corresponding trusted review receipt; changing
the flag alone cannot satisfy the original receipt. Nothing writes those unit
approvals to the catalogue or makes the shipped candidate trusted.

The pure contract test links synthetic hypothesis → fresh-context metadata → the
real skip-link candidate gate → internal_only with exact reason `review required`.
A separate end-to-end test executes the real skip-link registry on all six local
HTML challenges in fresh Chromium contexts, hashes the actual missing-target
DOM/result bytes in memory, links that reproduced evidence to a hypothesis,
execution and assessment, evaluates the actual challenge outcomes, and still
returns internal_only / `review required` for the candidate. No artifact storage,
review authority or real-world generalisability is implied by this local test.

Final verification on this packet:

| Command | Result |
| --- | --- |
| `npm ci` | Completed once for this dispatch, exit 0 |
| Step 0 `npm run build` | Passed, exit 0 |
| Step 0 `npx tsx --test test/catalogue-*.test.ts test/promotion-*.test.ts` | 16 passed, 0 failed/cancelled/skipped, exit 0 |
| Final `npm run build` | Passed, exit 0 |
| `npx tsx --test test/evidence-*.test.ts test/catalogue-*.test.ts test/promotion-*.test.ts` | 39 passed, 0 failed/cancelled/skipped, exit 0 |
| `npm test` (run under an outer 300-second limit, which did not fire) | 289 passed, 1 failed, 0 cancelled/skipped; 290 tests, exit 1 |
| Exact-base isolated `timeout 180s ./node_modules/.bin/tsx --test test/adaptive-arms.test.ts` | 18 passed, 1 failed, 0 cancelled/skipped; 19 tests, exit 1 |

The sole full-suite failure is the existing malicious-fixture assertion in
`test/adaptive-arms.test.ts:147`: it expects `dynamicAdvantage.comparable` to be
false but observes true. It reproduces on an archived exact base
`af29f88d84e9e3d1501bcda6464751e7dfc12639` with the same installed dependencies.
No adaptive source or test changed in this packet. All added evidence tests and
the promotion repair pass; the existing failure prevents claiming a completely
green repository suite.

## Production callers remain unconnected

Read-only inspection found these existing paths, which neither import nor invoke
`decidePublication`, `resolveCase` or the new record schemas:

| Path | Current behavior left in place |
| --- | --- |
| `src/report/build.ts` (`buildReport`) and `src/report/html.ts` | Select existing violation/incomplete probe results and write/render report.json and report.html using current report/provenance contracts |
| `src/report/site.ts` (`buildSiteReport`), `src/report/site-contracts.ts`, `src/report/journeys.ts` | Group site findings and journey summaries and write the existing site JSON/HTML report |
| `src/site/audit.ts` (`auditSite`) | Run scout/scan/journeys/triage, write audit manifests and call the existing site report builder |
| `src/watch/compare.ts` (`compareSiteReports`) and `src/watch/contracts.ts` | Compare existing report snapshots and write watch.json with current NEW/PERSISTING/RESOLVED and journey change semantics; no new case-resolution policy is applied |
| `src/cohort/run.ts` (`runCohort`) | Aggregate existing site findings/journeys and write cohort summary.json without publication filtering |
| `src/cli.ts` (`report`, `audit`, `watch`, `journey`, `cohort` commands) | Invoke the existing builders, comparator and journey runner and print/export existing results |
| `scripts/control-center-runner.ts` | Discover report/artifact files and upload them with content hashes; it does not enforce the new publication decision |
| `cloudflare/src/population-analysis.ts` (`buildPopulationAnalysis`) | Read stored site reports and construct population-analysis findings from existing report contracts |
| `cloudflare/src/worker.ts` GET `/api/v1/analysis/population` | Export the existing population-analysis JSON attachment |
| `cloudflare/src/worker.ts` GET `/api/v1/runs/:runId/artifacts/:artifactId/content` | Serve existing report JSON/HTML/screenshot artifacts through current operator access and response-header controls |

Consequently these pure functions are not enforcement for production reports,
site artifacts, population exports, artifact viewing or watch history. No existing
report is reclassified or rewritten. Control-center outreach states/permissions,
including `OUTREACH_READY` and operator `outreach` authorization, are untouched:
**outreach eligibility did not change**. Connecting a real review authority,
integrity verifier and those callers requires a separately reviewed integration.
