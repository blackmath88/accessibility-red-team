# Frontier-first adaptive testing: build and evaluation plan

Date: 2026-10-25
Owner intent: implement this bounded follow-up, then evaluate before adding orchestration.
Starting point: PR #42 at 116cb4398efd2f90eb50553e63d4e4cf6ccdec93 (unmerged).
This plan supersedes the proposed immediate six-stage/critic/hybrid expansion, not historical trial records.

## Context and question

Trials 1–3 in ADAPTIVE_MISTRAL.md exposed action-contract failures, missing continuity, then exploration and interpretation failures. Trial 3 verified 2/6 seeded defects in one run. It is not a stable performance estimate. The skip-link case visited a working sibling and omitted the broken sibling despite remaining calls.

Question: does explicit machine-maintained exploration state improve verified coverage, and does model-directed selection outperform deterministic frontier scheduling?

Keep the TypeScript/Playwright/zod harness, containment, budgets, evidence contracts, provider adapter and baseline. No framework rewrite. Defer PydanticAI, critics, hybrid routing, automatic code generation/promotion and additional agents as product architecture.

## Scope and authority

Build, mock-provider tests, local fixture execution and a draft implementation PR are authorised. No new live API calls or spending authority is implied; existing API permissions must be checked for their exact remaining scope. Prepare live comparisons without executing them unless a current explicit target/model/currency budget covers them. No public targets, merge, deployment or production routing change.

Read canonical Weavr operating contract and current repository/Observatory/Weavr state before dispatch. Do not invent Mission authority, waive Needs or overwrite concurrent work. Existing coordination snapshot is old; verify local runtime state. Use approved GitHub inbox commands for any Weavr writes.

## Implementation

### 1. Trace diagnosis before edits
Inspect exact model-visible observations from trial 3: was each sibling discovered, included, truncated, selected, navigated, probed, interpreted and reported? Record unavailable traces. Repository docs are secondary to raw artifacts. Preserve original trials unchanged. Use oracle-URL assistance only as a labelled diagnostic, never an unassisted benchmark score.

### 2. Executable frontier
Add bounded, versioned zod contracts and a ledger maintained from actual browser/tool events:
- page: stable ID, canonical URL, discovery source, visited status;
- state: page, relevant menu/dialog/focus preconditions and observed transition identity;
- obligation: page/state/probe, applicability known or unknown, pending/executed/blocked/deferred, evidence refs and reason;
- completion: remaining obligations and exclusions, terminal reason.

Do not equate visited with tested, or tested with passed. Model prose cannot mark execution complete. Do not infer sibling behavioral equivalence from a template signature. Bound size and expose truncation explicitly; retain a durable ledger even when the model sees a compact subset. Avoid attempting an exhaustive universal state graph.

### 3. Compact observation and completion
Expose the relevant frontier with outstanding work and prior outcomes. Reuse existing discovered-URL navigation; add page-ID convenience only if diagnosis justifies it.
Treat finish as a completion proposal. Controller records complete-within-declared-scope, partial, blocked, exhausted or cancelled based on execution evidence. Relevant reachable pending obligations prevent a complete claim, but need not force unlimited exploration: preserve explicit sampling rules and hard caps.
Persist candidate findings before final completion so budget expiry does not erase them. Preserve existing candidate/ref validation and keep this behavior equal across comparative conditions.
Version skills/contracts and retain a reproducible historical baseline configuration. Do not silently retrofit baseline trials.

### 4. Deterministic scheduler
Add an experimental selector that uses only observable frontier facts and a frozen documented ordering (e.g. breadth-first, stable tie-break). Run the same behavioral probes available to the comparison arms. Never consult fixture truth, filenames that reveal defects or scripted defect-specific routes.
Reuse existing safe journey primitives where practical. If a missing probe adapter is required, expose it equally to model and scheduler conditions and label that tool change separately.
No model calls in scheduler mode; no expansion of production imports or browser permissions.

### 5. Measurement and fixtures
Score separate transitions: discovered -> model-visible -> selected -> visited -> relevant probe executed -> correctly interpreted -> evidence-backed reported.
Keep exploration and interpretation outcomes separate. Log model-visible omissions and clipping.
Ground truth is evaluator-only; test at instance/behavior level. Include working controls and irrelevant links; neutral URLs; randomize order and defect location. New variants must change structure as well as text.
Development fixtures may be inspected freely but must not be called held-out. Freeze code/prompts/scheduler/config before opening held-out cases; record exposure. Models/tools cannot access truth manifests or repository source.
An unlisted but valid finding goes to separate blinded adjudication, not automatic false-positive or verified credit. Preserve malicious/errored-arm noncomparability.

## Comparison protocol

Conditions:
A historical/current tester replayable at pinned version;
B same model with visible ledger and completion accounting;
C stronger pinned Mistral model with identical ledger/tools;
D deterministic scheduler with identical available probes.

Because shared tooling/persistence may improve behavior, report any differences between A and B explicitly; add a ledger-hidden control if needed to attribute gains to visibility rather than shared repairs. Do not claim causality from multiple simultaneous changes.

First run a small no-API smoke set to validate observations, oracle assertions, scoring and cancellation. Prepare the fuller paired benchmark (suggested 8 held-out variants x 5 repeats x 4 conditions = 160 sessions) as configurable, not mandatory immediate execution. Obtain exact model IDs/prices and total budget before live run. Same browser action/time caps; record tokens and cost separately. Equal model-call count alone is insufficient.

Metrics: unique verified defects, issue-level precision/recall with raw counts, page/state/probe coverage, premature completion, fresh-context reproduction, denied actions, failures, API/local costs, latency and blinded review effort.
No credit for verbosity, duplicate axe calls, duplicate findings, self-reported coverage or page visits without required probes.

Proposed preregistration thresholds for the narrow benchmark (engineering choices, not scientific standards): +20 percentage-point recall vs current tester, >=90% recall, >=95% precision, <=10% premature completion under comparable caps. Report counts, variation and inconclusive outcomes; tiny smoke sets cannot substantiate these thresholds.
If scheduler matches strongest model within 5 recall points at lower cost/review effort, prefer deterministic exploration for this class. This is not evidence against all semantic or dynamic testing.

## Acceptance

- Trial-3 skip-link failure reproduced as a regression: working sibling must not imply broken sibling tested.
- Ledger event provenance, bounds/clipping, navigation denial, terminal accounting and budget/cancel behavior tested.
- Local no-model scheduler and fake-model ledger runs produce evidence-linked comparison artifacts.
- Browser containment regression suite remains green; no new network capability.
- Ground truth inaccessible to tester/scheduler; clean controls and malformed/unsupported evidence handled.
- npm run check plus focused fixture comparison passes, or exact failures recorded.
- Independent review of final implementation commit; correct findings and recheck.
- Documentation and PR summaries distinguish historical live trials, new mocked runs and pending API comparisons. Correct stale “no live calls ever” wording without inventing results.

## Claude Code / Orca handoff

Use installed Orca instructions and real runtime state. Start a new isolated feature worktree from the verified current PR #42 head; record its SHA and compare against this plan's pinned head. Open a stacked draft implementation PR targeting feat/adaptive-assessment-experiment while #42 remains unmerged; do not merge or rewrite #42.

Read this plan from docs/frontier-benchmark-plan, current repo instructions, relevant ADRs and ADAPTIVE_MISTRAL.md. The plan doc is on a separate branch; read it without merging unrelated history. Keep that docs branch untouched.
Implement the bounded scope above. Prefer one builder packet plus independent review; parallel workers only for clearly disjoint work. No recursive delegation. Use an initial supervised 30-minute packet and checkpoint if more work is needed. Verify worker deadlines/settlement and real effective model identity.
Return exact commits, reviewed SHA, checks, sample local comparison, diagnostic conclusions and remaining run approvals. No API key output, new paid calls, public runs, merge or deployment.

Cloud planning session cannot launch local Orca. Owner starts Claude using this handoff.
