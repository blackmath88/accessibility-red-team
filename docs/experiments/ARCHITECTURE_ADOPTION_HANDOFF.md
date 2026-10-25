# Claude Code handoff: establish and exercise ADR-0014

Owner intent: adopt the supplied architecture direction with the accompanying sparring corrections.
Authoritative reconciled proposal: ../adr/0014-exploration-adjudication-promotion.md.
Base inspected: e7e0fc9 (frontier PR #45 already merged).
The original zip's CLAUDE_CODE_BRIEF limits its initial task to documentation. Do not treat the wider architecture
as an instruction to build the whole platform.

## First packet: reconciliation and documentation

Read current repo instructions, Observatory, canonical Weavr operating contract, current mission/session/runtime
state and Orca's installed orchestration contract. Use real Orca for any dispatch. Do not invent governance state.

Inventory local worktrees and remote main; preserve active workers and unpushed work. ADR-0013 already exists:
do not overwrite it. Read ADR-0014 and report any remaining contradiction with code.

Inspect existing learning/promotion, validation/program.yml, journeys, frontier and case/report models before
proposing new entities. Existing code wins factual claims; proposal governs intended future behavior only.

Complete factual navigation/status pointers and a verified stale-claims note. Avoid relabelling old ADRs as
accepted. Record direction using existing coordination schema without inventing human sign-off or authority.
No baseline tag is necessary to do this; propose it rather than pushing it.

Run documentation link checks and JSON/schema checks actually applicable. Open one reviewable docs PR with
a clear current-vs-target map and exact implementation packet below. Do not merge automatically.

## Next implementation packet (separate feature PR)

This handoff supplies bounded scope to build after documentation reconciliation; no platform migration.
Reuse merged frontier and scheduler rather than reimplementing them.

A. Decision replay preparation:
- Extract exact model-visible trial-3 missed-sibling and dialog packets if raw traces exist.
- Record hashes, code/skill/model versions and missing artifacts.
- Preserve originals; produce original/frontier-visible/restructured variants with controlled differences.
- Mock runner and evaluator separate action choice from evidence interpretation; no model self-explanation scored
  as diagnosis. Account all requests, including multi-turn follow-up.
- Dry-run 120-call matrix as a proposed experiment; no real requests without current explicit scope/spend authority.
- Short localhost continuation harness verifies that candidate interventions work across actions and unexpected state.

B. One-probe promotion contract:
- Reuse the existing skip-link probe through a typed TS registry.
- Add applicability, assumptions, limitations, environment, precise claim, abstention, version and validation evidence.
- Exercise violating/clean/inapplicable/ambiguous fixtures.
- Preserve existing outcome and standards-claim strength; no report eligibility inferred from registry membership.
- Demonstrate candidate review gates, no automatic trusted promotion.
- Represent manual/assisted adjudication separately; do not automatically publish model/human prose.

No DO, YAML plugin layer, new UI, framework rewrite, hybrid routing or broad source relocation. Any missing
production publication enforcement should be reported and scoped, not claimed implemented by docs.

Acceptance: meaningful regression and negative cases, current containment checks green, npm run check and focused
local mock/fixture checks, independent exact-commit review. Report implemented/mocked/live-observed separately.
Never claim a benchmark improved without actual paired evidence.

## Operating bounds

One initial supervised 30-minute packet, checkpoint if unfinished; at most two workers for disjoint tasks,
no recursive delegation. Inspect overlap before work and settle attempts before replacements. No paid API calls,
public targets, recruitment/messages, deployment or merge. No keys in prompts/logs. Open draft PRs for review.
Cloud planning session cannot launch the local Orca runtime.
