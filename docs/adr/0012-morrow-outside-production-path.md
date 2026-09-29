# ADR-0012 — Morrow stays outside the production path

Date: 2026-09-29  
Status: Accepted  
Refines: ADR-0011

## Context

Morrow is a local model runtime on Nebuchadnezzar, the host that runs the persistent observatory worker. The
tempting next step is a semantic-provider layer that the worker calls during runs.

An investigation ([MORROW_EXECUTION_ARCHITECTURE.md](../MORROW_EXECUTION_ARCHITECTURE.md)) found:

- no pipeline stage has a measured, text-decidable ambiguity;
- no human labels to evaluate one against;
- that every candidate except axe-`incomplete` triage is solved or solvable at levels 0–2, or has UNKNOWN as an
  acceptable fallback.

## Decision

1. No model call in the worker, control plane, scanner, report, outreach or state machine.
2. Morrow may be used only in an **offline experiment over frozen evidence**:
   - no network, browser or tools;
   - typed input and output via `src/evaluation/semantic-experiment.ts`;
   - outputs stored as derived experiment artifacts that never overwrite observations.
3. Even that experiment is built only when the re-entry gate is met:
   - the `evaluation:ambiguity-census` frequency gate for a `text_semantic` rule;
   - human labels for that rule;
   - a measured deterministic baseline.
4. If it is built, the integration is a direct OpenAI-compatible adapter validated with the existing zod
   contracts. There is no provider framework, no separate service, no Python/Pydantic runtime and no MCP
   boundary until a second evaluated task exists.
5. Any production use requires a new ADR with evaluation results.

## Consequences

- Wave 1 and later runs stay fully reproducible and model-independent.
- Unresolved `incomplete` evidence continues to go to human review. That cost is now measured by the census
  rather than assumed.
- The Morrow Arm C in `docs/PILOT_ZH_SO.md` remains valid as research, but it starts from a census and labels,
  not from an integration.
