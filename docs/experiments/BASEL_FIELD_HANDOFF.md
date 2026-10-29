# Basel-Stadt field strategy and evidence handoff

Owner request, 2026-10-29: report what we built, the evidence trail, current architecture and improvement outlook;
discover Basel's customer-facing digital services; prepare and run a small batch suitable for discussion
with prospective Basel government partners. Claude Code is senior coordinator; Orca supports useful workers.

Code base: PR #52 at 87d6e175d2c3db1e582d21c885d42577c70e0f30.
Main last inspected: c8a70f8249ce660a1609ae7a7b9909b8d6785e06.
PR #52 remains draft; do not merge it implicitly.
Read current repository instructions, Observatory, Weavr operating contract and state before operational work.
Use Weavr MCP first where available. Last cloud read found no registered accessibility project or online runner.
Do not invent a Mission or dispatch. Direct isolated work on Nebu is within this owner instruction.

## Outcomes — make it useful, keep it small

1. Short illustrated progress report, including evidence trail, architecture, actual AI results and outlook.
2. Sourced map of Basel's public service landscape and a reusable, prioritized batch manifest.
3. Completed public-only smoke batch and 2–3 evidence-backed case cards if genuine cases are found.
4. A concrete partner-pilot proposal based on observed coverage and remaining expert questions.

Initial supervised window: 120 minutes from local start. Stop new field jobs by minute 95, settle owned work,
complete the report/checkpoint by 120. No unbounded overnight job or invented continuation.
At most two disjoint workers; one may inventory official public sources while another prepares the progress
report. Coordinator serializes live browser work and validates findings. Use Orca when this saves work.
No infrastructure rebuild, GPU driver work, new review system, broad crawler, DOs or new UI framework.

## Read the experiment correctly

Read ABC_LOCAL_HYBRID.md, abc-report/ and the actual run manifests/judgments.
Verify the archive checksum and availability; do not reconstruct missing evidence.
Preserve s1/s2/s3 and their exact code/model/prompt versions.

A is the EXPERIMENTAL frontier scheduler + its rule table. Its fixture result is not proof that the production
scanner implements every same check, nor that the scheduler is safe for public origins.
Select the existing public-safe deterministic scanner/journeys for field execution.
Never expose the fixture executor to public origins by weakening its loopback containment.
Map fixture capabilities to actual production checks explicitly; missing adapters are coverage gaps.

Summarize:
- s1/s2: A found 4/4 seeded barriers each round; B/C found 0.
- s3: A 12/12 seeded instances; Mistral 6/12; distinguish distinct barriers, instances, duplicate claims and
  supported/contradicted/insufficient verdicts.
- M visited pages but attached false/wrong evidence and skipped the needed dialog interaction.
- M's wall time includes the configured rate limit; do not call it pure model latency.
- Local qwen3:1.7b ran on CPU. These data do not describe all local models or GPU inference.
- USD 0.073 total reported Mistral spend; verify ledgers before any further calls.
- All are exposed development fixtures, not field recall/precision or AT-user validation.

Role-specific improvement gates:
AI as detector needs verified execution/evidence and acceptable false-claim behavior.
AI as summarizer/triage aid needs faithful evidence-grounded wording, not detector recall.
A partner pilot of deterministic tools need not wait for AI to beat the fixture scheduler.

## Part 1 — source-backed Basel discovery

Official starting points (re-fetch and record retrieval time):
- https://www.bs.ch/
- https://eportal.egov.bs.ch/
- https://www.bs.ch/erklaerung-zur-barrierefreiheit

The accessibility statement is the authority's SELF-DESCRIPTION, not our independent assessment.
It states partial conformity and identifies PDFs, video and embedded external content as limitations,
and describes an existing review/improvement process and a 2025–2028 communication action plan.
Use that context respectfully: identify incremental task-level evidence, not a redundant scanner dump.

Basel-Stadt includes the city of Basel plus Riehen and Bettingen.
Verify the allocation of city/canton/municipality responsibilities from official sources before assigning owners.
Keep Riehen/Bettingen as contextual references in the service map; do not add their websites to this scan batch.
Do not treat all of Basel-Stadt as a single municipality or all service boundaries as the same operator.

Map resident and business tasks, for example:
moving/address/residence confirmation; identity and appointments; waste; mobility/permits;
tax information; childcare/education; benefits/support; permits for businesses.
These are candidate tasks, not preverified available services or predefined accessibility findings.
Choose actual high-value services after official discovery.

Inventory fields, in CSV or JSON using existing repo conventions:
service ID/title, audience, civic task, entry URL, linked transaction URL,
responsibility (city/canton/municipality/unknown), operator with source and confidence,
public/login/third-party/PDF boundary, languages, interface/page type, provenance URLs,
relevant accessibility disclosure, priority and reason, discovery/assessment status, exclusion reason.
Mark observed versus inferred. Vendor/template similarity prioritizes sampling; it never proves equal behavior.

Aim to inventory roughly 20–30 service entries and prepare a queue of 8–12 representative public pages.
Inventory is not exhaustive. Do not force a fixed count by inventing entries.
Sample by user task and interface variety, not department count or the first URLs a crawler finds.

Public ePortal descriptions distinguish services needing registration from public offerings.
Do not authenticate, create accounts or infer anything about the accessibility of unvisited login-only stages.
Record external service hosts as a future queue, not permission to scan them.

## Part 2 — bounded public field batch, authorized here

Exact permitted initial origins:
https://www.bs.ch and https://eportal.egov.bs.ch
Only publicly reachable informational and service-entry pages.
Inspect robots/site guidance and contact constraints; do not evade restrictions or repeat blocked requests.

Budget:
- one browser/page assessment at a time;
- discovery at most 40 unique HTML documents, depth <=2 from reviewed official service entry points;
- assessment at most 12 selected pages, with explicit reasons;
- at least 3 seconds between top-level navigations, no automatic retry storm;
- per-page existing timeout <=30 seconds; field batch wall cap 25 minutes;
- prefer existing cache/replay rather than re-fetching all discovery pages.

Do not weaken existing network policy to allow an asset host. Use configured public-safe behavior;
record resource exclusions and possible effects on evidence.
A redirect to another origin is a recorded boundary, not permission to follow it with testing.
No subdomain enumeration, port scanning, vulnerability scanners or broad link traversal.
No form submission, typing into real forms, login, file upload, payment, reservation, account creation or
state-changing interaction, including GET actions that look like writes.
Safe keyboard/menu/dialog observations only where the existing public journey policy supports them.
Do not click ambiguous controls to see whether they submit. Stop at that boundary.

If a required public-safe tool is missing or containment cannot be established, prepare the queue and report
the blocker; do not repurpose the contained experimental runner against public websites.

PDFs and external embedded services: record where the task depends on them. Do not claim PDF/AT testing
coverage from HTML scans, fetch whole document collections or cross origin to investigate.
Use pages with minimal personal information; do not collect application records or user data.

Capture exact URL, timestamp, code/scanner/probe/profile versions, viewport/browser, screenshot,
DOM/axe/focus evidence, coverage, exclusions, terminal status and artifact hashes.
Preserve axe violation/incomplete/pass/inapplicable/error distinctions.
Classify findings as observations within a research benchmark profile unless actual applicability is sourced.
Do not convert a journey heuristic or missing automated signal into a legal/WCAG verdict.

Deduplicate repeated components, but preserve affected occurrences and evidence.
No site ranking, whole-site score or inferred city-wide conformance rate.

## Role allocation

Algorithmic:
target constraints, discovery accounting, executable checks, evidence capture, dedupe, comparison and budgets.
Only executed and reproduced checks count as verified field observations.

Nebu local model:
optional low-stakes clustering/task labels from public, sanitized excerpts; clearly marked suggestions.
Do not put qwen3:1.7b back in charge of browser navigation based on failed experiments.
Local inference use is within time/resource limits; avoid contention with browser/test jobs.

Mistral:
optional ambiguity triage or concise wording from bounded PUBLIC evidence, with citations and abstention.
Never final detector, standards/legal authority, source of operator permissions or fabricated remediation.
Check every material statement against actual evidence; unknown remains unknown.
Keep model text separate from verified observations. Do not send public screenshots containing personal
information or hidden/authenticated content to an API.

Claude:
coordinates, chooses sample/tasks and reviews evidence in fresh contexts where useful.
Its review is model-assisted, not an AT user's experience, human government acceptance or publication approval.

Mistral USD 5 is the ORIGINAL aggregate cap for this evening, not a reset.
Sum earlier ledgers (reported USD 0.073) plus new reservations/calls/failures. No paid Claude API or provider
fallback. If original ledgers/cap cannot be established, continue algorithmic discovery without new paid calls.
Existing eligible Claude subscription is available for development coordination/review.

## Part 3 — concise visual report

Deliver one portable German HTML report with screenshot assets/evidence links and a brief Markdown summary.
Prefer extending existing report styles over a new dashboard.
A reader should understand the conclusions in five minutes.

Include:
1. What we built/tested and what is still proposed; dated main/PR states.
2. Compact architecture diagram: deterministic execution/evidence; optional models; review/export.
   Clearly distinguish implemented opt-in export from existing builders/serving paths not yet connected.
3. Results A/B/C/M, counted correctly with raw denominators and exposed-fixture limits.
4. Basel service map and assessed-batch table: completed/blocked/not tested, no coverage inflation.
5. Up to three real, independently reproduced case cards with task, screenshot, relevant focus/DOM trace,
   observed consequence, reproduction steps, cautious remediation hypothesis, source owner/unknown,
   and whether Basel already discloses this issue class.
6. Improvement outlook split into process/evidence, useful model roles and partner/AT validation.
7. One concrete next step and a small proposed partner pilot: service task, owner, expert validation,
   repeatable retest, useful output. No implied endorsement, funding award or agreed participation.

A screenshot alone cannot establish focus history or accessible-name correctness.
Reproduce candidate issues in a fresh browser before elevating them as report observations.
If no defensible barrier emerges, show coverage, useful negative results and unresolved boundaries;
never manufacture three case cards. Separate synthetic demonstrations from new field evidence.
For a real live page, proposed fixes are hypotheses; no claim that it is fixed until a comparable real retest.
Do not modify public sites. A local mock repair, if shown, must be labelled illustrative.

Findings remain a private working/research report for owner review, not signed publication authority.
Do not fabricate human signature, email partners or publish the report.
Commit only small sanitized screenshots or evidence extracts after checking for personal/sensitive information.
Preserve larger raw field evidence outside git with hashes, location and retention caveat; avoid exposing
sensitive content to a public PR. Keep historical archive and new field artifacts separate.

## Delivery, checks and settlement

Use an isolated branch based on the verified #52 head; open a stacked draft PR against that branch while it
is unmerged. Preserve #52; do not rewrite its experiment history. Explain branch dependencies.
Save report, source inventory, queued/run manifests, results and provenance; one documented local command
should open the report and resolve every selected screenshot/evidence link.
Run meaningful focused checks, build/full normal tests at final code checkpoint, docs/diff checks,
and browser review of report links, keyboard behavior and narrow layout.
Inspect workflow triggers before push so unintended live scans/deployment are not triggered.
Obtain independent exact-commit code review when changing execution/policy code; report any pending gate.

Return exact SHAs/PRs, actual sampled URLs/counts and evidence, API spend, report command and archive hashes.
State implemented/tested/live-observed/human-reviewed separately.
Stop launching jobs by minute 95, verify owned worker settlement and leave a resumable checkpoint.
Do not let unavailable Weavr dispatch, a missing local model or GPU acceleration become an excuse to skip
otherwise authorized isolated discovery and deterministic field work.
