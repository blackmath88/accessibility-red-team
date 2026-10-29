# Next milestone — Basel Adaptive Investigation Loop

Date: 2026-10-29
Status: owner-requested plan; implementation and new investigation runs NOT yet performed.
Short name: Adaptive Investigation Loop (AIL).
Purpose: AI designs and revises falsifiable experiments; deterministic software enforces authority and records results.

## The change in direction

We are not optimizing an LLM to click through known seeded defects.
We are testing whether reasoning over collected evidence produces a useful NEW measurement, explanation or
tool correction beyond the baseline report.

discover → capture → hypothesize → design executable probe → challenge → execute → reproduce →
cluster / revise the hypothesis → next targeted measurement

Generated executable probes MAY change within a bounded investigation.
Human approval is not required for every code iteration inside the fixed envelope.
Execution permission, evidence-supported conclusion, reusable catalogue trust and external publication are
different decisions. Neither model agreement nor a valid schema is proof of a barrier.
Continue preserving manually verified barriers that cannot become general automated checks.

## Repository situation

- Main: c8a70f8; production/publication foundation is there.
- #52 at 87d6e17: A/B/C/M experiment; keep negative results and raw traces unchanged.
- #53 at 7f1b02f: actual Basel field evidence; 12 assessed pages, 25 service entries,
  two reproduced observations requiring different qualifications, and one focus-heuristic false alarm.
- #54 at cc8cd6f: first discovery scope visual and wider research plan, not a completed inventory expansion.
- This plan stacks on #54; no implicit merge, replacement of active work or source reset.
Refresh exact heads and local worktree ownership before implementation; compare drift explicitly.

Read proposed ADR-0015 alongside ADR-0012/0013/0014.
ADR-0013 currently explicitly prohibits generated code and keeps its adaptive executor fixture-only.
Do not silently remove those protections or enable its disabled public mode.
This owner request supplies a bounded new research direction, not blanket production autonomy.

## M1 — first Basel closed-loop investigation

Primary case: the very faint required-field hint on www.bs.ch/apps/zonensuche.
Known: two screenshot states were measured near 1.12:1 rendered contrast; computed CSS suggested 4.48:1.
Unknown: whether the sampled pixels represent the intended glyphs, whether overlap/opacity explains it,
and which viewport/scroll state produces the observation. It is not a confirmed layout cause or legal verdict.

M1 succeeds if all of the following are demonstrated:
1. A real model formulates competing explanations from baseline evidence.
2. It authors a NEW executable probe or meaningfully adapts one based on an observed result.
3. The probe runs within tested capability limits and records geometry/style/focus/pixel facts.
4. At least one explanation is supported, rejected or explicitly remains inconclusive after countertests.
5. A fresh browser replay supports the stated conclusion with artifacts.
6. A concise before/after investigation card shows what the baseline could say and what the loop added.
7. A second local structure/control challenges the measurement, so one successful page recipe is not claimed
   as a general detector.
8. Generated code, broker calls, code/config/model hashes, judge decisions and evidence links are replayable.

A rejected overlay explanation can meet M1 if the new measurement defensibly rejects it.
“No improvement over baseline” is a valid completed experiment, not a fake success.
A positive screenshot, a judge vote, a fabricated signed finding or a completed framework alone cannot meet M1.

## Two follow-ups, not prerequisites

M2: Apply the loop to the existing keyboard-focus false alarm. Measure viewport/scroll position and actual
indicator state, challenge the heuristic with clean/failed local controls, and propose a versioned tool repair.
Do not automatically ship the repair into production or rescore old runs.

M3: Reason across ONE civic task and its responsibility boundaries. Preferred research case:
public residence-certificate instructions → transaction link → payment/document boundary, all latter stages
unassessed. Alternative: verify the research report's alleged inconsistent building-application instructions.
Check current/legacy route status before calling that a contradiction.
Deliver a sourced task map, an exact uncertainty and targeted public evidence collection, not a broad crawl.

M1 is the next milestone. Do not wait for a complete Basel digital-landscape inventory or M2/M3.

## Small architecture

Keep discovery data and evidence in existing artifacts. Add only missing experimental contracts:
- Investigation: user task, hypothesis/alternatives, fixed scope, budgets and stop state.
- ProbeProposal: measurement question, falsifier, code hash, input evidence, requested capabilities,
  positive/negative controls, expected output schema and limitations.
- ProbeExecution: exact code/config/model IDs, permitted calls, output/denials/artifacts and terminal state.
- Judgment: supported/rejected/inconclusive, cited measurements, counterexamples and proposed next action.
- Synthesis: incremental value versus baseline, related issues, responsibility/source confidence and next step.

Use existing Zod, provider, trace, containment, evidence and report machinery.
No general agent SDK, plugin marketplace, workflow engine, new DB, DOs, mandatory MCP layer or production rewrite.

Logical roles (not five persistent agents):
- Claude senior coordinator owns the fixed envelope, integration and stopping.
- Designer model proposes hypotheses and executable measurements.
- Fresh critic/judge context challenges the experiment and its inference.
- Broker/executor enforces limits; it has no model discretion over authority.
- Synthesizer clusters only evidence-backed results; merges remain reversible with originals linked.
Reuse a model for several roles if useful, recording shared lineage; shared errors remain possible.

## Dynamic executables without unrestricted authority

Do not call static lint, a judge approval or Node vm a security boundary.
Generated code must NOT inherit Node filesystem/process/network, shell, environment/keys, full Playwright browser
objects or a coordinator RPC token. In-process code can escape or exhaust the coordinator unless genuinely isolated.

First implementation should support:
A. Generated analysis code over frozen sanitized measurement packets.
B. Generated experiment orchestration calling a narrow read-only browser-capability broker.

Real executable control flow/analysis may be model-generated; do not replace it with a canned fixed recipe
and claim dynamic synthesis. New measurements can be expressed through the constrained broker.
If a measurement requires a new broker capability, add/test that capability as coordinator implementation,
not an agent-controlled escalation.

Use an available verified isolated execution route with no ambient network/secrets/host mounts, bounded
CPU/memory/output, kill/settlement and a per-attempt capability token. Inspect actual runtime support before choosing it.
If such isolation is unavailable, implement the contract/fixtures and report LIVE DYNAMIC EXECUTION BLOCKED.
Do not spend the whole packet building a general sandbox platform or silently run generated JS on the host.
Judge/critic may reject low-quality experiments; broker independently enforces allowed behavior.

Suggested broker operations:
- bounded rendered DOM/style/ARIA/focus measurements from fixed implementation code;
- element geometry and elementsFromPoint for a bounded set of selectors derived from known evidence;
- scroll to a bounded position in the current approved document;
- viewport choice from a fixed small list and screenshot capture;
- fresh-context replay on the exact approved URL/local fixture;
- attach measured JSON/artifact IDs.

The broker implements page.evaluate with FIXED reviewed snippets and validated data arguments;
it does not expose arbitrary evaluate/JS, page routing, request APIs or a raw Page handle.
No model-generated selector is concatenated into executable JS; bound length/count and validate resolution.
Generated code cannot write a signed finding, approve a probe or mutate permissions.

## Countertests for the hint investigation

Before live execution, freeze competing explanations and an initial measurement plan:
- wrong/empty crop or antialiased edge pixels;
- opacity inherited from ancestors;
- translucent sticky overlap;
- offscreen/clipped text or differing scroll/layout state.

Collect exact text bounds, relevant computed styles/opacity, intersecting overlay bounds, elementsFromPoint,
viewport, device scale, scroll and screenshot provenance.
Assess foreground/background selection honestly; pixel minima alone do not identify full glyph contrast.
Compare normal and observed scroll states and at least two viewports within the cap.
Do not change live styles or remove the suspected overlay as a causal intervention.
Causal manipulation belongs in a clearly labelled LOCAL copy with/without overlay and a clean negative control.
The local copy tests a mechanism; it is not proof that Basel deployed exactly that cause.
No screenshot-only claim about screen-reader behavior or complete WCAG conformance.

One adaptive change after the first execution is the minimum iterative demonstration if facts justify it.
Return every failed/contradicted attempt. Cap at 3 hypotheses × 2 generated probe revisions (6 attempts),
plus fresh replay/control checks; stop when answered, cap reached or only AT/service-owner validation can resolve it.
No unbounded self-improvement, loops or cherry-picked final run.

## Authority and run budget for the first implementation packet

Initial execution packet: 120 supervised minutes from local start; reserve last 20 for report/checks/settlement.
At most 2 coding workers on disjoint worktrees; no recursive delegation.
Nebu is the requested investigation/model host, subject to actual availability; NUC can coordinate if eligible.
Use Orca for meaningful parallel builds/review, not as proof of enforced safety.

Public measurement target: ONLY https://www.bs.ch/apps/zonensuche.
Other sources may be read for standards/stakeholder research under the existing discovery scope;
that is not permission to execute dynamic probes on their applications.
Keep all existing third-party/login/transaction hosts unassessed.

Live cap: at most 16 new top-level page loads including failed attempts/fresh replays, concurrency 1;
at least 10 seconds between top-level requests or stricter current site guidance; reuse cached evidence first.
Track top-level loads separately from subresource HTTP requests; bounded per-page resources/data/time.
No form input/submission, login, payment, download, arbitrary clicking, live DOM changes, background channels
or off-origin navigation by generated code. Preserve existing public-safe network/resource policy.
Do NOT enable ADR-0013's disabled experimental public mode by flipping a flag.
Use a separately reviewed narrow measurement broker with the existing public-safe runner or keep execution local.
Boundary tests must refuse off-target calls, write/network attempts, unbounded output and post-timeout callbacks.
Test malicious/forged page observations and judge approval cannot bypass broker decisions.

Mistral uses the EXISTING USD 5 evening aggregate ledger, not a reset; previous reported spend USD 0.073.
Verify source/prices/model identities and reserve worst-case costs for all calls, errors and retries.
If the ledger is missing, use existing eligible Claude subscription/local inference without new paid calls.
No paid Claude API, unspecified new provider, large model downloads or GPU infrastructure work.
No production changes, catalogue trust promotion, signed approval, merge/deploy, outreach or public report.

This owner requested a repo plan; this cloud session does not dispatch the run.
Before any governed dispatch use current Weavr Mission/Needs/topology and explicit execution authorization.
No Weavr Project or eligible runner was present in this planning read. A local Claude implementation handoff
may be executed only within the actual authorized task/session, with no invented governed state.

## Incorporate the two supplied research reports

Raw reports:
- docs/research/basel/2026-10-29-stakeholders-and-standards.md
- docs/research/basel/2026-10-29-service-landscape.md

Treat them as model-assisted RESEARCH INPUT, not accepted facts, scope authority or complete legal analysis.
Add a short claim ledger for the chosen task/observation:
claim → report reference → primary source URL/section/date/retrieval → confirmed/contradicted/unknown →
jurisdiction/applicability → confidence → implication for investigation and owner routing.

Prioritize:
- service/task owner, bs.ch platform/editorial owner, technical maintainer and independent validator separately;
- Fachstelle's coordination/monitoring role versus actual system access/release authority;
- WCAG/eCH version as stated policy versus binding applicability to a specific service;
- current code/content split and actual supplier/contract evidence;
- city/canton responsibility versus jointly owned/public-task bodies and private delivery platforms.

Current targeted primary-source checks during planning:
bs.ch accessibility statement names WCAG 2.1 AA/eCH-0059 v3.0, partial conformity, a code/content fix split
and Webredaktion feedback. ePortal terms distinguish platform and service questions and reference AGOV login.
The communication action-plan page describes 2025–2028 departmental/municipal participation.
These are document statements, not independent compliance verification.

Do not bulk-accept the reports' legal labels or named personnel. Examples needing verification:
eCH approval/publication dates differ between report passages; ePortal update date is not its effective date;
a 2023 Liip implementation award is not a 2026 maintenance contract; ePortal operator/source uncertainty differs
between the landscape table and the stakeholder report. Keep the disagreements visible until sourced.
No procurement-law advice, current-contract conclusion or named-person contact without validated evidence.

## Acceptance report — short and visual

Extend the existing Basel report; no new dashboard framework.
One overview page plus maximum three case cards and evidence attachments:
- Before: baseline observation and uncertainty.
- AI contribution: hypothesis and generated code/iteration with links.
- Measurement: what ran, what it ruled out, counterexample and fresh replay.
- Result: supported/rejected/inconclusive, user-task relevance and remaining AT uncertainty.
- Responsibility/standard: verified source and known/unknown handoffs.
- Outcome versus baseline: new useful evidence, false hypotheses, elapsed/review time and costs.
- One next step justified by the result.

Include a compact diagram of implemented loop versus proposed/deferred capabilities.
Preserve raw failed runs, code diffs, broker denials, judge packets and screenshots in an integrity manifest.
Sanitize sensitive values and keep bulky/private evidence outside public git.
A fresh reviewer should be able to reproduce the conclusion without trusting a model explanation.

Definition of done:
- one real evidence-driven generated/adapted probe executed safely;
- control and fresh-context tests;
- honest supported/rejected/inconclusive finding about the measurement question;
- reproducible provenance and report links;
- meaningful focused tests plus final build/normal tests/docs/diff checks where touched;
- independent read-only exact-commit review for executor/broker code, with unresolved gate explicitly pending;
- resumable artifact paths, settled workers and draft implementation PR.

If isolation cannot be proven or results add nothing, report that precisely and preserve the useful parts.
Do not call a generated plan, a model verdict or broader URL count milestone completion.
