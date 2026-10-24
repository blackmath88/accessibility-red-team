# ADR-0013 — Experimental adaptive assessment track

Date: 2026-10-24  
Status: Proposed — owner-requested research track 2026-10-24  
Relates to: ADR-0011, ADR-0012 (unchanged)

## Context

The deterministic observatory samples surfaces, runs axe and a handful of scripted safe journeys, and reports what
they find. Reviews of its output (see `docs/experiments/ADAPTIVE_ASSESSMENT_BUILD_PLAN.md` on the plan branch)
surfaced a different question from the one ADR-0011/0012 answered: *can an adaptive tester that chooses its own next
browser action, plus an observer that critiques both runs, add verified coverage or discoveries that the
deterministic path misses, and can those discoveries be turned into repeatable deterministic checks?*

Examples: pages reachable only through a menu, menu toggles mistaken for dialog triggers, component defects repeated
across pages, pages classified from words in their URL.

ADR-0012 decided that no model call belongs in the production path and that a text-semantic experiment over frozen
evidence waits for a measured ambiguity gate. That gate concerns interpreting already-captured text. It is not
evidence for or against *adaptive browser testing*, which is a different question with different risks (a tool-using
agent in a browser) and different safeguards. This ADR neither relies on nor argues against that frequency gate.

## Decision (proposed)

1. A **separate, sandboxed experimental track** lives entirely under `src/experimental/adaptive/` (plus `test/`
   fixtures and `docs/experiments/`). Nothing outside `src/experimental/` imports it; a test enforces that.
2. Browser tools are permitted **only** inside that track, and only **bounded by deterministic enforcement that does not
   depend on the prompt**: origin allowlist for navigation, redirects, popups and subrequests; private/metadata
   destination blocking in public mode; refusal of form submission, typing, uploads, downloads, non-GET requests and
   login/payment-like controls; activation limited to controls passing an extended version of the existing safety
   rules; a fresh disposable browser context per session; hard budgets (steps, model calls, tokens, response bytes,
   wall clock); cancellation that closes the context and persists partial artifacts. Skill text is guidance, never the
   boundary.
3. Model output is data: a validated action union chosen from a legal-action list derived from the current
   observation, executed by ordinary code. No generated code, selectors, shell or URLs outside the discovered,
   allowlisted set. No silent retries, no escalation, no fallback provider.
4. Two assessment arms stay independent (deterministic baseline; adaptive tester), are pinned and sealed
   before an **observer** compares them. The observer emits **hypotheses only**; it never accepts findings or produces
   patches. Promotion of any candidate into the scanner is a separate, human-reviewed, versioned change.
5. All CI and the default CLI use a scripted fake provider on localhost fixtures. Fixtures carry ground truth, and
   one held-out variation is reserved for honest generalisation reporting.
6. **ADR-0012 is unchanged and still governs production**: no model call in the worker, control plane, scanner,
   report, outreach or state machine.

## Three things this ADR keeps apart

| Question | Status |
|---|---|
| Authorisation to *build* the experiment (offline harness, localhost fixtures, mock-provider tests, draft PR) | Given by the owner on 2026-10-24. |
| Approval of *this ADR* as the standing decision for the track | **Not given.** Status stays Proposed until a reviewer accepts it. |
| Permission to run a *live trial* (real model, paid API, any non-fixture target) | **Not given.** Needs a separate approval naming credential source, model, spend cap and exact targets. |

Building the harness does not imply the other two. No live model call and no public-site scan is performed by this
change.

## Consequences

- The deterministic path is untouched and reproducible. Production code does not import the experiment.
- The experiment can show negative or inconclusive results; those are reported as such, with fixture truth as the
  only notion of "verified".
- Known residual risks are documented in `docs/experiments/ADAPTIVE_HARNESS.md` (for example DNS rebinding in public
  mode, DOM-derived accessible names, and a baseline arm that has no policy layer of its own).
- A live pilot, a real provider adapter in CI, or any production use each require their own decision.
