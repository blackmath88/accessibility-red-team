# NUC build plan — evidence-led exploration and probe promotion

Date: 2026-10-25
Owner instruction: put the reconciled plan in the repository; the NUC builds.
Direction: [ADR-0014](../adr/0014-exploration-adjudication-promotion.md).
This is the implementation entry point following the documentation handoff in
[ARCHITECTURE_ADOPTION_HANDOFF.md](ARCHITECTURE_ADOPTION_HANDOFF.md).

## Outcome and execution boundary

Deliver a local, reproducible vertical slice:
hypothesis → evidence → one candidate probe → validation record → explicit publication eligibility.
Also prepare decision replay and short live-browser continuations using local fixtures and fake providers.
Keep a separate human-adjudication path for barriers that cannot be compiled into a reusable check.

Build packets 0–3 below as bounded feature work, with reviewable commits and a draft PR.
The owner requested implementation preparation here; this planning session does not start the NUC,
dispatch a Weavr mission, merge, deploy, contact anyone, or authorize paid API requests.
Later packets are conditional roadmap, not permission to expand the implementation.
Do not stop at producing another plan when running this handoff on the NUC: implement the initial slice.

## Verified starting point

Remote main inspected: e7e0fc9f2d3319c271fdca9208cdd9cc0c5feb39.
Existing direction PR: #46, branch docs/evidence-promotion-architecture.
No AGENTS.md, CLAUDE.md or .weavr paths appeared in the inspected main tree.
Observatory coordination contains D1–D4 and C4–C6, with no declared gates; its September snapshot is
not evidence of current runtime availability. The configured snapshot path was absent on main.
No live Weavr/Orca runtime state was available to this cloud planning session.

| Supplied assumption | Current repository fact | Build consequence |
|---|---|---|
| New direction can use ADR-0013 | ADR-0013 already describes the adaptive experiment | Use proposed ADR-0014; preserve ADR-0013 |
| Frontier must be built | PR #45 is merged; frontier.ts, scheduler.ts and completion tests exist | Audit and extend; do not rebuild |
| Move calls to src/explore | The isolated implementation is src/experimental/adaptive | Keep its boundary and imports |
| Three safe journeys | engine.ts runs four, including dialog.focus-behavior | Preserve IDs and five outcomes, including error |
| Dedicated skip-link module | skipLinkJourney is private inside src/journeys/engine.ts | Extract only the minimum reusable function if needed |
| Existing full promotion service | learning contains contracts.ts and mine.ts; adaptive candidate-checks.ts validates a specific trigger classifier | Extend contracts; do not pretend a generic promotion service exists |
| Drop baseline 088b0f8 / 401e166 | main is e7e0fc9 | Compare actual commits; never reset to the supplied baseline |

Sources inspected: CONTRIBUTING.md, package.json, validation/program.yml, .observstory/coordination.json,
src/learning/contracts.ts, src/experimental/adaptive/{frontier,candidate-checks}.ts,
src/journeys/{contracts,engine}.ts and current open PR #46.

## Packet 0 — local reconciliation and baseline

Read repository instructions, Observatory and blackmath88/weavr/docs/CHATGPT-OPERATING-CONTRACT.md.
Inspect current Weavr project/mission/session state and local Orca state when available.
Never invent a mission, waive needs or dispatch from this document alone.
Any approved Weavr write uses a new immutable .weavr/inbox command.

Fetch refs, inspect status/worktrees, active local processes and unpushed commits.
Read the PR #46 docs without merging them automatically. Record main and plan-head SHAs.
Start an isolated feature branch from current verified main; bring only the planning documents needed.
Keep #46 unchanged during implementation. If main has moved, reconcile relevant diffs before edits.
No tags, branch cleanup, resets or destructive operations are necessary.

Read ADRs 0011–0014, existing adaptive build plans, ADAPTIVE_MISTRAL.md, learning/validation/report/watch
contracts and frontier tests. Treat old branching instructions in FRONTIER_BENCHMARK_BUILD_PLAN as historical.
Create one short current-versus-target map in the implementation PR, including missing local trace artifacts.
Capture existing check failures before attributing them to this change.

Exit: exact base, actual reusable modules, current runtime ownership and bounded writable paths recorded.
Missing historical traces block historical replay claims, not the local implementation work.

## Packet 1 — replay preparation and accounting audit

Scope: src/experimental/adaptive/, focused test/adaptive-*.test.ts additions, and experiment docs.
Reuse provider, executor, containment, persisted ledger, scheduler, budget and evaluator components.

1. Locate exact model-visible trial-3 messages for the missed sibling and one dialog/focus decision.
   Pin hashes and code, skill, provider/model and sampling settings. Never reconstruct missing originals
   from narrative summaries. If unavailable, mark historical extraction blocked and use explicitly labelled
   synthetic/local smoke packets to test the machinery.
2. Freeze two packet families. Variants: original, frontier-visible, restructured evidence.
   Transformations must be documented and preserve observed facts; relevance may differ by decision point.
   Keep evaluator answers separate from model-visible packets and runtime tools.
3. Prepare a manifest: 2 points × 3 variants × 2 model slots × 10 repetitions = 120 single-response evaluations.
   This counts requests, not browser sessions or multi-turn recovery. Separate any finish-rejection continuation,
   retries and malformed-response handling in request accounting. Do not execute paid requests.
4. Add a fake-provider dry-run using configured exact model slots or explicit unresolved placeholders.
   Separate next-action scoring from evidence interpretation. Model explanations are not diagnoses of belief.
5. Audit execution versus assessment versus follow-up in the existing frontier.
   A recorded inspection is not proof of barrier adjudication. An inconclusive result must not silently close
   an investigation. Preserve ledger-hidden and visible conditions for attribution.
6. Use short localhost continuations to test late evidence, repeated finish proposals, unexpected state,
   cancellation, budget expiry and persistence/recovery. If current persistence supports artifacts but not
   resumable execution, document that distinction and implement only the recovery needed by this slice.

Exit: reproducible no-API replay matrix and fixture continuations, known missing traces listed,
and no benchmark quality claim without observed runs.

## Packet 2 — exactly one typed probe and promotion gate

Scope: small src/catalogue/ and src/promotion/ modules if no suitable existing home exists,
minimal src/learning/ and src/journeys/ adaptations, focused tests and catalogue documentation.
No YAML loader, dynamic code loading or migration of all checks.

Wrap existing skip-link.same-page semantics. Its current detector inspects at most 20 fragment links,
recognizes a bounded set of link texts, flags a missing same-page target, treats an existing non-main target
as incomplete, and treats no recognizable link as inapplicable.
It does not prove keyboard bypass behavior or WCAG conformance. A wrapper must preserve that limitation.
Malformed fragments or unsupported inputs must produce explicit error/incomplete semantics rather than
being converted into a violation. Changes to the underlying detector require their own regression evidence.

Define a versioned typed entry:
- stable probe ID, implementation/upstream version, maturity and origin hypothesis;
- applicability, assumptions, known limitations, environment dependencies and intended deployment scope;
- precise claim template, existing outcomes plus explicit abstention mapping, required evidence;
- upstream references and German remediation;
- validation record references and reviewer decision bound to the exact entry/implementation digest.

Reuse CandidateCheck's existing status/source vocabulary where meaningful. If a separate Hypothesis schema is
necessary, document an explicit mapping; a legacy PROMOTED status alone never establishes trusted eligibility.
Keep the existing aria-controls classifier validation as a separate experiment, not this skip-link promotion.

Challenge the wrapper with fresh browser contexts:
missing target, working main target, no recognizable link, existing ambiguous/non-main target,
malformed input, and an independent structure not used to tune detection.
Exercise sibling pages independently, with clean controls.
Record false positives, false negatives, applicability/abstention and unsupported cases with raw counts.
Previously inspected fixture variants are development cases, never newly held-out evidence.

Gate output is eligible_for_review / rejected / insufficient_evidence, with reasons.
Passing fixtures does not automatically assign trusted maturity.
Promotion requires a recorded human decision and exact reviewed version; test with clearly synthetic reviewer
records without claiming a real sign-off. Invalidate that decision when implementation or claim digest changes.

Exit: one real existing check executes through the registry; the validation gate blocks incomplete,
unsupported and unreviewed promotion. The resulting new entry remains candidate until reviewed.

## Packet 3 — assessment/adjudication/publication contracts

Scope: minimal shared evidence contracts and a pure publication-policy function with focused tests.
Prefer existing report/learning contracts; introduce a new module only where it avoids mixing unrelated records.
Do not rewrite production report generation or watch history in this first slice.

Separate:
- immutable ProbeExecution/AssessmentResult, including outcome, evidence and environment/version identity;
- Hypothesis and reproduced observation;
- human adjudication, bound to exact claim/evidence versions and reviewer;
- FindingCase identity with linked assessments and a longitudinal disposition.

Model assessment_mode (automated/manual/assisted), verification and publication_eligibility independently.
Publication policy denies raw hypotheses, candidate/experimental/retired entries, missing evidence,
incomplete/inapplicable/error outcomes and stale approvals.
Automatic eligibility requires a trusted automated violation, valid provenance and applicable scope.
A reproduced manual/assisted barrier can be reviewer_approved without a deterministic probe; it cannot become
automatic from that approval. Raw model prose can never satisfy reviewer authority.

Tests must reject fabricated/missing approvals and evidence-version mismatches.
Resolution needs a comparable retest of the same relevant obligation: skipped, blocked, inapplicable,
incomplete, errored or version-incompatible retests are not resolved.
Any implemented case comparison must preserve not_retested and non_comparable distinctly.

Exit: local end-to-end demonstration of hypothesis → reproduced evidence → candidate validation →
review required, plus a separate synthetic human-adjudication example.
These are internal artifacts; a pure policy function is not yet enforcement in every production report path.
Document precisely which production callers remain unconnected. Do not imply outreach eligibility changed.

## Verification and return

Use Node >=20 and repository setup instructions. Run npm run check and
python3 .github/check-public-docs.py, plus focused mock replay/fixture/policy tests introduced above.
Use npm run adaptive:frontier-local and adaptive:frontier-benchmark only after inspecting their flags/configuration;
run bounded fake/scheduler localhost modes, never incidental live provider configurations.
Validate all new JSON against its schema. Existing five journey outcomes must survive adapters unchanged.
Retain containment, evaluator-truth isolation, cancellation and budget tests.
No Cloudflare changes are expected; run its checks only if that scope is separately authorized and touched.

Seek independent review pinned to the final commit using an available isolated route.
If unavailable, label self-review and leave the draft review pending; do not claim an independent pass.
Return exact commits, checks/results, sample artifact paths, real/mocked distinctions, unresolved baseline
failures and next action. Do not commit secrets, personal recordings or bulky generated runs.

Use an initial supervised 30-minute implementation packet and checkpoint if incomplete.
No new paid calls, public scans, deployment, merge, recruitment, messages, automatic promotion or scope expansion.
No worker dispatch is requested by this plan; use local installed routing contracts if separately delegated.

## Conditional continuation after the initial slice

| Stage | Concrete deliverable | Entry/exit condition |
|---|---|---|
| Controlled evaluation | Real frozen replays and paired localhost continuations versus scheduler | Exact models, credentials, currency/request caps separately authorized; preregister arms before runs |
| Limited report integration | Wire policy into the actual report export boundary with legacy adapters | First inventory all publishers; unversioned legacy results retain their existing claim class and cannot silently become trusted |
| Longitudinal cases | Connect immutable results to cases and comparable retests | Skip/incomplete/non-comparable regression tests prevent false resolution |
| Early AT input | One consented assessment to challenge useful-barrier/evidence definitions | Owner arranges participation/compensation/consent; no recording without retention/access rules |
| One coordination actor | ExplorationSession/lease coordination if failure evidence justifies it | Choose from measured needs; command IDs, generation fencing, reservations, idempotent results, reconciliation and one authority |
| Wider catalogue | More reviewed checks and scope-specific challenge sets | First probe contract survives review; preserve per-axe-rule IDs/config/version; avoid broad trust inheritance |
| Review UI and outreach | Evidence review and restricted export, then scan/report/contact/retest cycle | Existing validation/program.yml gates and explicit operational authorization |

For the evaluation, a +20-point verified-detection gain versus current tester is a proposed practical threshold,
not an established fact. Compare false claims, review minutes, cost and premature completion under equal
browser/time caps. If a heuristic matches model selection at lower burden, keep it for scheduling and reserve
models for useful semantic judgments. Keep manually verified barriers and failed promotions in research value.

DOs remain part of the possible target architecture, not a prerequisite for this learning slice.
Git owns reviewed checks; evidence blobs use existing R2; existing D1 records remain authoritative until an
explicit migration declares a single new authority and rebuildable projections. Property jobs, reports,
sessions and outreach have separate lifecycles. No HypothesisDO-first assumption, exactly-once alarm claim,
Morrow runtime service, hybrid routing or automated outreach wording.
