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
2. Browser tools are permitted **only** inside that track, and only in **fixture mode** (loopback / `*.test` fixture servers,
   which is the only mode that can start). What is enforced, in ordinary code outside the prompt, and how:
   - *Page and frame requests*, including redirects, run through Chrome DevTools Protocol `Fetch` interception on the
     page session; each request is decided against an exact-origin allowlist, and anything off it is failed
     (`subrequest_off_allowlist`, `redirect_off_allowlist`, `origin_not_allowed`). Dedicated workers are covered by the
     same interception (verified by test). Non-GET/HEAD requests are refused.
   - *Channels the interception cannot see* are closed instead of filtered: WebSockets are refused outright with
     `context.routeWebSocket` (deny-all, never connected); SharedWorker is removed from the browser
     (`--disable-blink-features=SharedWorker`, plus an init-script stub as defence in depth); service workers are blocked
     by the browser context. Tests drive each channel against an off-origin server and assert it is never reached.
   - *Page behaviour*: form submission, `window.open` and new pages are neutralised; downloads and file choosers are
     cancelled; there is no typing action; activation is limited to controls passing an extended version of the existing
     safety rules; a fresh disposable context per session; hard budgets (steps, model calls, tokens, response bytes,
     wall clock); cancellation closes the context and persists partial artifacts.
   - *Page-writable harness channel*: a page can call the harness binding, so nothing a page passes is recorded or shown
     to the model; browser-policy denial records are fixed harness-authored text and are capped.

   **Public mode is disabled.** Its decision functions (private, loopback, link-local, metadata and embedded-IPv4 destination
   checks) are kept and unit-tested, but `runSession` refuses to start a public session until the known gaps are closed
   (resolution is done by the harness process and not pinned for the browser, the resolution cache never expires, no host
   mappings are supplied, site isolation is off) **and** the owner approves it. The allowlist and subrequest rules above are
   therefore claimed for fixture mode only. Skill text is guidance, never the boundary.
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

## Known follow-ups

- **Separate production fix, not part of this track:** `src/scope.ts` `isPublicIp` treats some IPv4-mapped, NAT64 (`64:ff9b::/96`)
  and 6to4 (`2002::/16`) IPv6 literals as public although they embed private or loopback IPv4 addresses (for example
  `::ffff:a9fe:a9fe`, the hex form that URL parsing produces for `[::ffff:169.254.169.254]`). The experimental path works around
  it with a stricter check (`isPublicAddress`); `scope.ts` itself is unchanged and should be fixed on its own review.
- **Residual risks of fixture mode:** the observation and activation classifiers run in the page's main world
  (`observePage`, `classifyActivation`), so a hostile page can spoof the DOM they read (for example make a risky control look
  safe, or hide one). The network layer, not the classifiers, is the boundary: even a mis-classified click cannot reach an
  off-allowlist origin, send a non-GET request or open a WebSocket. A page can also forge the enum-only browser-policy
  denials by calling the harness binding; they carry no page text but are not proof that the harness refused something.
