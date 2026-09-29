# Morrow execution architecture — investigation and decision

Date: 2026-09-29 · Status: decided (see [ADR-0012](adr/0012-morrow-outside-production-path.md)) · Base: `main` @ `f25168b`

**Decision in one sentence:** deterministic software runs the observatory; Morrow stays an offline experiment
on frozen evidence until a measured, text-decidable ambiguity with human labels justifies one typed call.

This investigation tried to disprove the need for a Morrow integration before designing one. It succeeded:
there is currently no demonstrated semantic gap that justifies putting a model in the production path.
The only thing built is a deterministic measuring instrument (`evaluation:ambiguity-census`).

## 1. Current runtime topology

Facts (from the repository):

```text
Cloudflare Access → Worker API + React Control Center (state only: D1 runs/events, R2 evidence)
        ↑ outbound HTTPS only (Access service token, per-run lease)
Nebuchadnezzar worker (scripts/nebuchadnezzar-worker.ts → scripts/control-center-runner.ts)
        → npm run audit: SCOUT (src/scout) → axe probes (src/scan.ts) → safe journeys (src/journeys)
        → triage (src/triage) → report (src/report) → content-addressed upload
```

- No code path calls a model. Dependencies: Playwright, axe-core, zod, yaml, jose. No LLM SDK.
- The only AI artefacts are **offline research contracts**: `src/evaluation/semantic-experiment.ts`
  (typed input/output, decision-space and evidence-citation validation) and `evaluation/morrow/system-prompt.md`.
  `docs/NEBUCHADNEZZAR_MORROW_PILOT.md` describes a manual Arm C on frozen evidence. Nothing wires it to the worker.
- Journey, SCOUT and baseline manifests record `aiCalls: 0`.
- ADR-0011 and `docs/SEMANTIC_COMPILER.md` already set the budget: zero AI for capture, probes, requirement
  resolution, watch; near-zero elsewhere; any call must beat a non-AI baseline.
- Observstory coordination: decision D1 ("deterministic software owns control flow; AI optional and bounded")
  and commitments C4/C5 (fixture harness and deterministic journey-gap fixtures *before* expansion or outreach use).

Assumptions (not verifiable from the repo):

- Morrow exposes, or can expose, an OpenAI-compatible HTTP endpoint on Nebuchadnezzar.
- The frozen deterministic pilot evidence (5 sites, run `deterministic-pilot-20260929T100045Z`) is on
  Nebuchadnezzar only; it is not in the repository.

## 2. Semantic gaps actually found

Evidence of unresolved states in the pipeline:

| Unresolved state | Where produced | Measured frequency |
| --- | --- | --- |
| Page archetype `unknown` | `src/scout/classify.ts` | Not recorded per run; SCOUT baseline lists kinds without `unknown` for its 3 sites |
| axe `incomplete` (needs review) | `src/scan.ts` → `probe-results.json`, baseline `axe-results.json` | **Unmeasured by rule.** Field summaries list `incompleteRuleIds` but nothing aggregates them |
| Journey `incomplete` | `src/journeys/engine.ts` | ZH small-pilot journey baseline: 32 of 40 results unresolved (18 `incomplete`, 14 `inapplicable`) |
| Coarse finding groups | `src/triage/triage.ts` groups by `probeId:outcome` only | Structural; affects every site |

Only one of these is a semantic ambiguity in the ADR-0011 sense: **axe `incomplete`**. Its resolvability by a
text model depends entirely on which rules produce it, which nobody has measured. If it is dominated by
`color-contrast` over images/gradients, a text model is the wrong tool (it needs pixels).

## 3. Candidates rejected as deterministic (or not yet justified)

Escalation levels: 0 lookup/data · 1 rule · 2 heuristic · 3 typed decision · 4 constrained synthesis · 5 agentic.

| Candidate | Current solution | Failure mode | Freq. / impact | Deterministic improvement | Semantic option (closed space · UNKNOWN) | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Page archetype | Keyword + form/link signals → `unknown` | Unmatched pages become `unknown` | Unmeasured · low: `unknown` pages are still sampled (last priority) | Extend term lists; DOM/role features; URL families (L1–2) | enum of `SurfaceKind` · `unknown` | **Reject**: UNKNOWN is an acceptable fallback |
| Representative-surface selection | Priority order + structural fingerprint dedupe | May miss a service page | Unknown · medium | Fingerprint clustering, sitemap hints (L2) | pick index among code-generated candidates | **Reject**: heuristic, no labels |
| Component intent → journey | Selector mapping (`aria-expanded`, dialog, nav, form) | Unconventional widgets → `inapplicable` / `incomplete` | High (18 of 40 `incomplete`, 14 `inapplicable` in ZH baseline) · medium | Detector fixtures per C5 (L1) | fixed journey enum | **Reject now**: C5 requires deterministic fixtures first; most incompletes are detector limits |
| Finding grouping | `probeId:outcome` | Different templates merged, same template split across rules | Every site · medium | DOM/selector signatures, template hashes (L1–2) | cluster id among precomputed groups | **Reject**: structural problem, L1–2 |
| Shared template/component cause | none | not reported | — | Occurrence across surfaces + selector/DOM hash (L2) | — | **Reject**: L2 |
| Remediation / quick-win class | not implemented | — | — | rule-ID → remediation-class table + prevalence (L0–1) | `LIKELY_LOW_EFFORT/COMPONENT_FIX/CONTENT_FIX/UNCERTAIN` | **Reject**: table covers known rules |
| axe `incomplete` triage | reported for human review | Human-review burden | **Unmeasured** · high if frequent | rule-specific extra checks (e.g. computed-style contrast when background is solid) (L1) | `likely_violation / likely_false_positive / requires_human_review` | **Only candidate**; gated on census + labels |
| Report summary | deterministic templates | none observed | — | templates (L0) | — | **Reject**: would rewrite deterministic information |
| Outreach language | deterministic templates; sending not implemented | — | — | templates (L0) | — | **Reject**: out of scope; would rewrite deterministic information |

For the only candidate, if it ever passes the gate:

- **required evidence:** the probe's node HTML, target selector, `failureSummary`, rule ID and version;
  optionally its surface screenshot reference;
- **fallback:** `requires_human_review`, which is today's behaviour;
- **evaluation:** human labels against the deterministic baseline, using the metrics in section 9.

## 4. Architecture options considered

| Option | Complexity | Type safety | Deterministic control | Provenance / caching | Portability | Fit with minimum-AI |
| --- | --- | --- | --- | --- | --- | --- |
| A Direct adapter (fetch → OpenAI-compatible endpoint → zod) | ~50–100 lines | zod (existing) | full | explicit per call | any OpenAI-compatible server | good *when a task exists* |
| B Typed `SemanticTask`/`SemanticProvider` layer | registry, runner, cache, providers | zod | full | built-in | good | premature with zero tasks |
| C Separate local semantic service | new process + API + auth | split across two codebases | full | duplicated | good | adds a network boundary with no capability |
| D PydanticAI / Python agent runtime | new language runtime, deps, agent loop | duplicates zod with Pydantic | weakened by agent loop | framework-defined | Python-only | contradicts ADR-0011 (no agentic problem exists) |
| E MCP capability | MCP server + client | schema via MCP | tool-calling invites model-driven control | ad hoc | good | no external capability to expose |
| **F No integration (now)** | none | — | total | — | — | **exact fit** |

## 5. Selected architecture

**F now.** No model call in the worker, control plane, scanner, report or outreach path.

**A later, offline only**, when the re-entry gate in section 11 opens. The shape would be one function that
turns a `SemanticExperimentInput` into a validated `SemanticExperimentOutput`, reusing the existing contract. It
runs from a separate CLI over frozen evidence and writes raw input/output pairs as experiment artifacts.

Concepts worth borrowing without importing frameworks:

- zod-derived JSON schema for structured output;
- a content-addressed cache keyed by `sha256(task version, schema version, model id, canonical input)`;
- a provenance record per call;
- a fixture provider for tests.

**B** is reconsidered only when a *second* evaluated task exists.

## 6. Why the alternatives were rejected

- **A now:** there is nothing to call it with. An adapter without a gated task invites uses that no evaluation supports.
- **B:** abstractions over one hypothetical task tend to fit that task badly. Build it from two real ones.
- **C:** the worker and Morrow are on the same host; a service boundary adds auth, deployment and failure modes, and no capability.
- **D:** a second type system and runtime for a problem that is not agentic. The prompt's own kill criterion applies.
- **E:** MCP's value is exposing tools to models. Here the model must have *no* tools.

## 7. Trust boundary

```text
public website → deterministic browser/scanner → immutable, content-addressed evidence
──────────────── offline boundary (no network, no browser, no tools) ────────────────
frozen evidence files → [future] Morrow → typed decision → validateSemanticDecision → experiment artifact
```

Morrow needs no network access (beyond its own local inference endpoint), no browser, no repository or
filesystem access beyond the input it is handed, and no tools.

It sees bounded evidence only. It cannot act on, browse or re-contact a municipality, and it cannot change
observations, deterministic outcomes, run state or reports. Its outputs are *derived experiment data*, stored
beside the evidence and never overwriting it:

```text
OBSERVATION → deterministic derivation → [experiment] semantic decision → [future, if promoted] presentation
```

## 8. First semantic task

**None yet.** The only eligible candidate is axe-`incomplete` triage, restricted to `text_semantic` rules
(e.g. `label-content-name-mismatch`, `identical-links-same-purpose`, `p-as-heading`). It is not started until
the gate in section 11 opens.

## 9. Evaluation plan

1. **Measure (now, no AI).** Run `npm run evaluation:ambiguity-census -- <frozen-run-dir>` on the frozen
   deterministic pilot and, later, Wave 1. It reports axe `incomplete` by source, rule and modality
   (`visual_rendering`, `media_content`, `tooling_limit`, `behavioral_state`, `text_semantic`, `unclassified`),
   journey outcomes and reasons, and surface kinds. It also evaluates the frequency gate.
2. **Label.** Human-label a sample of the gated rule's nodes (`confirmed` / `false_positive` / `uncertain`)
   without any model output visible.
3. **Try deterministic first.** Add rule-specific checks where possible and measure them on the same labels.
4. **Only then compare.** Run the same frozen inputs through:
   - the deterministic baseline, which is `requires_human_review` for all;
   - the improved heuristic;
   - Morrow;
   - optionally a larger model.

   Record for each: accuracy against labels, UNKNOWN rate, false-confidence rate (a confident decision that
   contradicts the label), schema failures, latency, tokens, repeatability over 3 runs, and sensitivity to the
   model version.

Same frozen evidence → deterministic run → optional semantic run → measurable difference.

## 10. Failure / fallback behaviour

- With AI disabled, which is the default and the only production mode, behaviour is today's: unresolved
  results stay `incomplete` and go to human review.
- In the experiment, every one of these is recorded as a failed call and falls back to `requires_human_review`:
  - schema failure;
  - a decision outside the legal decision space;
  - citing evidence that was not supplied;
  - a timeout or an unavailable model.

  A failure never changes an observation.

## 11. Implementation slice and re-entry gate

Implemented now:

- `src/evaluation/ambiguity-census.ts` and CLI `npm run evaluation:ambiguity-census`: deterministic, reads frozen
  evidence only, `aiCalls: 0`, with fixture tests (`test/ambiguity-census.test.ts`).
- This document and ADR-0012.

**Re-entry gate.** An offline Morrow experiment (option A) may be built only when **all** of these hold:

1. **Frequency.** The census shows one `text_semantic` rule with at least 20% of observatory unresolved
   `incomplete` nodes, on at least 3 sites (`semanticReentry.frequencyGateMet`).
2. **Labels.** Human labels exist for a sample of that rule's nodes.
3. **Deterministic baseline.** A rule-specific deterministic improvement has been tried and measured.

Production use needs a further ADR, with evaluation results that beat the heuristic on false-confidence rate.

## 12. Kill criteria

Stop, or stay at F, if any of these holds:

- the census shows unresolved evidence is dominated by `visual_rendering`, `media_content`, `tooling_limit` or
  `behavioral_state`, none of which a text model decides;
- a heuristic reaches parity on the labelled sample;
- UNKNOWN (human review) remains an acceptable cost at pilot scale;
- the model mainly rewrites deterministic information;
- outputs cite unsupplied evidence or leave the decision space more than rarely;
- the model would need browsing, tools, or influence over crawl, journey or state decisions;
- results are not repeatable across runs or model versions within the measured tolerance.

"No Morrow call yet" is the current, successful outcome of this investigation.
