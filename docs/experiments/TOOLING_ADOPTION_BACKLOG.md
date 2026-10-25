# Later tooling additions — accessibility evidence and harness contracts

Recorded: 2026-10-25, from owner-supplied tooling adoption proposal.
Status: queued follow-up; does not expand the current NUC implementation packets.
Read with [NUC build plan](NUC_ARCHITECTURE_BUILD_PLAN.md) and
[proposed ADR-0014](../adr/0014-exploration-adjudication-promotion.md).
ADR-0012 remains in force. ADR-0013 identifies the existing adaptive experiment, not the hypothesis/finding split.

## Decisions

| Borrowing | Disposition | Activation condition |
|---|---|---|
| Scoped Playwright ARIA snapshots | First follow-up candidate | After initial slice, verify installed APIs and implement a small evidence-only pilot |
| BrowserGym/AgentLab harness and trace patterns | Borrow selected contracts in TypeScript | Audit existing contracts first; extend only gaps needed for replay and measurement |
| MCP tool wiring | Deferred | Measured missing capability plus demonstrated benefit from a protocol boundary |
| Security scanners and bundled security-tool MCP packs | Excluded | No activation within this project scope |

The supplied proposal labels two borrowings “now”. The owner's enclosing instruction queues these additions
for later; this record does not add work to a currently running NUC/Orca packet.
No dependencies, API features, benchmark improvements or external reference implementations were verified
by this documentation change. Verify technical details from installed packages and primary documentation
before implementation; BrowserGym/AgentLab are design references, not adopted dependencies.

## 1. Scoped ARIA snapshots

Purpose: add accessibility-tree evidence to the existing DOM, focus trace, screenshot and probe evidence.
Candidate APIs from the proposal: locator.ariaSnapshot() and toMatchAriaSnapshot().
Confirm exact availability, signatures and output in the installed Playwright version.

Repository-specific integration caution: main currently depends on playwright and uses Node's test runner
through tsx. Do not assume Playwright Test's expect/matchers are present because the browser library is installed.
Evaluate an assertion approach compatible with the current test runner; adding @playwright/test requires
an explicit dependency decision. Avoid a framework migration solely for one matcher.

First pilot:
- Capture one relevant subtree around a dialog or skip-link context, with selector, URL/state, timestamp,
  browser/Playwright version, viewport, locale and linked execution/evidence identifiers.
- Save a restricted raw artifact with hash/provenance and a bounded model-visible representation with explicit
  clipping. Capture through the contained executor, preserving its discovery/network/action restrictions.
- Link snapshots to existing evidence records rather than duplicating authoritative assessment state.
- Treat accessible names and page text as untrusted data and potentially sensitive capture.
- Add cases for missing/hidden subtrees, ambiguous matches, reordered content and clipped evidence.
- Use focus before/after, DOM and screenshot evidence to assess the barrier; a snapshot alone is insufficient.

A snapshot is neither a screen-reader transcript nor a guarantee of announcement order, live-region timing,
AT support or actual task usability. Keep all such limits explicit in claims and coverage.

Only after stability is measured:
- Evaluate positive/negative fixture assertions, including forbidden shapes where actually supported.
- Prefer semantically scoped assertions; avoid giant exact whole-page baselines and automatic baseline acceptance.
- Do not use snapshot changes alone to resolve a finding or establish run comparability.
- Watch/compare may show a readable tree change as supporting evidence, not an accessibility verdict.

Acceptance: small local fixture pilot, useful scoped evidence, bounded capture and no strengthened claims.
If harmless reordering makes assertions brittle, keep snapshots as evidence only.
Marginal effort and dependency cost are to be measured, not assumed zero.

## 2. Harness and trace patterns

Borrow the useful separation of reset, step and observation plus reproducible manifests.
Do not import Python research runtimes or copy an uninspected external schema.

Start with existing src/experimental/adaptive contracts, provider calls, observations, frontier and theatre events.
Preserve historical trace formats; add versioned adapters instead of retroactively rewriting trial artifacts.

Minimum contract gaps to inspect:
- reset establishes a fresh context/session and pinned execution configuration;
- each step links observation and exact model-visible packet, proposed action, validation decision,
  actual executor result, evidence IDs, frontier changes and budget deltas;
- outcomes distinguish provider, policy, browser and assessment failures;
- manifest pins code/skill/probe/model versions, conditions, fixture variants, repetitions, seeds where supported,
  action/time/request caps and sampling parameters;
- record exact request/response hashes, denied actions, clipping, usage and retry accounting where available.

Seeds alone do not guarantee provider determinism. Pin and report settings without promising identical outputs.
Keep evaluator truth outside worker/model observations. Preserve exact private packets separately from redacted
inspection views; a redacted or reconstructed view is not an exact replay source.

Align future theatre projections with the step event contract where useful; do not expand the UI now.
Exit: an individual decision can be inspected and replayed with its real context, and discovery, selection,
execution and interpretation can be scored separately. Reuse the current packet-1 work wherever it already
satisfies these requirements.

## 3. MCP — conditional only

The current Zod-validated contained executor remains the tool boundary.
Before proposing MCP, show:
1. A measured exploration failure caused by a missing browser capability.
2. Why a few direct functions are insufficient.
3. A bounded tool set and the protocol's concrete interoperability benefit.
4. Unchanged controller authority, scope, budgets and target validation, with containment/injection tests.

MCP would remain inside experimental exploration, never become authority to execute arbitrary shell/browser
actions or bypass the production model exclusion. A standard protocol is not a safety guarantee.
No broad tool packs or model-directed tool discovery are authorized by this record.

## Explicit exclusions

Do not add Nuclei, ZAP, Metasploit, nmap or security-tool MCP bundles as scanners.
Borrow engine/catalogue separation, staged evidence and validator gates where useful.
Accessibility testing remains within the project's existing safe interaction policy.

## Suggested later delivery order

1. Evidence-only ARIA subtree pilot.
2. Extend existing step/manifest contracts only where the pilot or replay exposes a gap.
3. Assess snapshot fixture stability and optional watch/compare evidence views.
4. Revisit MCP only on measured need.

Return exact APIs/dependencies verified, actual local fixtures run, limitations and reversibility.
No live public scan, paid call, outreach, framework replacement or infrastructure rollout follows from this backlog.
