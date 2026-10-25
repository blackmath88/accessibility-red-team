# Adaptive accessibility assessment — implementation plan and Claude handoff

Date: 2026-10-24
Status: owner requested planning and implementation handoff; no live model trial executed.
Base: main at 088b0f85fd20e0c9c0205ad8410fd4688ad99527.
Related: PR #40 (results review and narrower archetype experiment), PR #38 (unrelated branch archive).

## Purpose

Test whether an adaptive browser tester and an LLM observer add verified coverage and discoveries to the deterministic scanner, then turn useful discoveries into repeatable software. This is broader than interpreting axe incomplete findings or labelling page archetypes. Most unresolved Zürich contrast checks need visual evidence; a text model must not pretend to resolve them.

The Zürich review in PR #40 supplies motivating examples: Bachs news posts classified as forms; no service page sampled; navigation menus mistaken for dialogs; repeated component defects. Its reported findings are source material to verify, not ground truth for model scoring.

## Authority and policy

The owner explicitly requested this experimental build on 2026-10-24. Implementation, local fixtures, mock-provider tests and a reviewable draft PR are authorised. This does not authorise paid API usage, an unspecified live target, production integration, deployment, merge, automatic candidate promotion or unbounded self-modification.

ADR-0012 remains authoritative for the existing production path. Add a narrowly scoped experimental ADR documenting this owner-requested research track: browser tools are permitted only in the separate sandboxed experiment, bounded by deterministic enforcement. Do not change ADR-0012's accepted text or enable production routing. Distinguish authorisation to build the experiment from approval of the final ADR and permission to execute a live trial. Do not misrepresent the old text-semantic frequency gate as evidence against the distinct adaptive-testing research question.

Inspect current repository/Observatory and canonical Weavr state before operational work; use GitHub inbox commands for any Weavr writes. Do not invent a Mission, waive Needs or dispatch through missing governance state. No governed state has been verified from this cloud planning session.

## Three roles, two independent assessment arms

A. Deterministic baseline: existing discovery, selection, probes and safe journeys, pinned to a commit and configuration.
B. Adaptive tester: same starting URL and comparable target/time/action limits; independently chooses bounded next browser actions using a versioned accessibility testing skill. It must not see A's findings until its own run is sealed.
C. Observer: consumes A/B event traces and evidence, flags suspicious classifications, missing coverage, detector errors and candidate regression checks. It produces hypotheses, never accepted findings or executable patches.

These are logical roles, not a requirement for three concurrent agents or services. A single CLI and provider adapter are sufficient. Observer can operate at checkpoints; real-time means bounded observation during execution, not changing the scanner under an active run.

## Minimal architecture

Reuse TypeScript, Playwright, zod, existing evidence/report and theatre contracts where practical. Keep experimental modules/CLI out of production imports.

- Versioned skill: investigation method, evidence requirements, accessible-name/keyboard/menu/form discovery checks, uncertainty and stopping rules. Skill text is guidance, never the security boundary.
- Provider-neutral small interface with fake provider plus one direct Mistral adapter. No provider framework. Read key from an explicitly configured environment variable; no keys in repo, prompts, traces or logs. Pin requested model and record returned identity, usage and parameters. Do not assume tool calling, vision or schema support without preflight.
- Model receives bounded observations and legal action descriptors. It chooses a validated action union; ordinary code executes it. No arbitrary JS, shell, filesystem, URLs outside the allowlist or generated Playwright code.
- Actions initially: inspect semantic DOM/accessible names, navigate to an allowed discovered URL, focus/tab/shift-tab, activate an explicitly safe UI control, escape, scroll, capture evidence, finish/unknown.
- Capture page URL, timestamp, step, selector/target identity, pre/post state, relevant DOM facts, screenshots and hashes. DOM summaries are not a faithful screen-reader transcript.
- Text-only configuration may inspect structural/behavioral evidence. Visual claims require actual screenshot input to a verified vision-capable model or remain needs-review.
- Evidence refs must resolve within the run. Candidate finding: claim, observation refs, reproduction steps, limitations, proposed deterministic check. Unsupported output is rejected or retained as rejected evidence.

## Enforced browser boundary

Use a fresh disposable browser context, no user profile, cookies, credentials or connected browser session. Treat page text, URLs and tool output as untrusted content; no instructions inside evidence gain authority.

Explicit localhost fixture origin allowlist first. Public trial requires exact approved targets. Validate navigation and redirects, block private/internal/metadata destinations for public mode and prevent off-origin popups/subrequests according to an explicit resource policy. Prevent form submission, uploads, login, payment, destructive actions and intentional writes. Merely blocking non-GET requests is insufficient; constrain targets and controls too. Do not type into live forms in v1.

Network/content sizes, browser steps, model calls, tokens and wall time have hard limits outside prompts. Cancellation stops model requests and closes browser context; persist partial artifacts with terminal status. No silent retries, model escalation or fallback paid provider.

## Versioned improvement loop

Observe -> hypothesis -> reproduce on fixture/frozen evidence -> propose patch -> regression checks and review -> new scanner version -> new run segment.

Never hot-patch an active assessment. Pin code/skill/model/config per arm and segment. Link candidate, fixture, patch and validation evidence. Promotion requires review and remains separate from automated exploration. No automated git writes or code execution from model suggestions.

## Slices and acceptance

### S0: evidence and baseline repairs

Read PR #40 on its exact current head; preserve E1/E2 artifacts before 2026-12-25 with checksums and durable manifest, subject to available authenticated access. Do not commit bulky/private evidence into GitHub. Fix census site-path and axe-prefix normalization and classifier substring/news-path issues with meaningful regression fixtures. Verify any proposed heuristic against counterexamples; do not blindly treat every dated URL as news. Keep other journey repairs separately scoped if needed.

Acceptance: reproduced defects and corrected cases, no unexplained regression in existing checks; unavailable private artifacts explicitly recorded. Do not quietly import PR #40's old narrower trial as the current plan.

### S1: offline harness and policy

Build typed session/action/evidence/candidate contracts, deterministic action executor, hard budget/cancellation enforcement, fake model adapter and versioned skill. Add localhost fixture sites containing:
- dated news plus an actual service/form entry;
- menu/dialog ambiguity;
- valid and broken skip links;
- repeated component barriers;
- malicious page instructions and prohibited navigation/actions.

Acceptance: fake-provider end-to-end trace; forbidden actions/redirects denied; injection has no authority; invalid refs/schema fail safely; timeout/cancel settles; production scanner unchanged. Record policy denials separately from accessibility findings.

### S2: independent arms and observer

Run existing scanner and adaptive arm against equivalent fixture targets with separate state. Seal each arm before observer comparison. Produce machine-readable and readable comparison: surfaces/components/states visited, verified findings, duplicates, false alarms, evidence quality, missed cases, denied actions, time/model usage and cost when available.

Observer flags coverage mistakes and proposes fixture/check improvements. Demonstrate at least one candidate through reproduction and regression validation, without automatic promotion. Known seeded defects are development examples, not proof of generalisation; include a held-out fixture variation.

Acceptance: injected instructions cannot alter scope; dynamic arm reaches a meaningful state baseline missed in at least one fixture; claims verified against fixture truth; inconclusive or negative outcomes reported honestly.

### S3: Mistral readiness, then separately authorised live pilot

Implement adapter and configuration docs; all CI uses fake provider. No real API call until owner supplies/approves credential source, model and spend cap. No plaintext key in chat requested. Endpoint/model capabilities and provider data destination must be explicit; website snippets/screenshots leave the host when using Mistral.

Proposed first real trial: one localhost fixture session with Mistral, then one or two explicitly approved public sites if justified. Suggested public bounds to approve: 5 surfaces per arm, 30 actions, 10 minutes, 20 model calls and a stated currency cap. Token caps are enforced too. These are proposals, not spending or target authority.

Evaluate verified additional coverage/findings, false-positive rate, reproducibility, useful observer diagnoses, accepted deterministic improvements and total human review effort. No conformance certification or ranking. Compare like-for-like budgets and record unavailable costs as unavailable.

## Claude Code execution handoff

Read this document, repository instructions, canonical blackmath88/weavr/docs/CHATGPT-OPERATING-CONTRACT.md, relevant ADRs and PR #40. Use installed Orca orchestration instructions and real runtime state. User explicitly selected Claude Code via Orca; do not claim another runtime is Claude/Orca.

Start from current main in a separate worktree/feature branch; record exact base and any divergence from this plan. Do not merge #38/#40 or change their branches. Deliver S0-S2 and the mocked/tested S3 adapter in reviewable commits and one draft implementation PR. Add the experimental ADR as proposed. No live model call, scans of public sites, merge or deploy.

Use at most two workers; no recursive delegation; 30-minute initial supervised packet with a checkpoint if the slice exceeds it. Do not sacrifice enforcement/testing to finish the whole plan within that packet. Reserve disjoint paths for parallel work and serialize overlaps. For substantial implementation obtain independent review on exact final commit, then fix/recheck findings. Follow Orca's enforced deadline and settlement contract.

Run npm run check plus focused browser policy/fixture tests; run Cloudflare checks only if those paths change. Supply commands, exact commits, test outcomes, sample local trace/comparison and remaining gates. If Orca/provider/evidence access is unavailable, report the exact blocker and continue only independent authorised preparation.

Final report must distinguish implemented, mocked, tested, live-observed and pending. This cloud session cannot launch local Orca; the owner will start Claude with this handoff.
