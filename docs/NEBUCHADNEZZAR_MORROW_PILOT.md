# Nebuchadnezzar / Morrow pilot runbook

Goal: compare deterministic-only evidence with the same evidence plus a bounded local Morrow decision.

## Preconditions

- Run from a trusted clone of this repository.
- Keep the deterministic evidence packet unchanged between arms.
- Record repository commit SHA.
- Record Morrow model identity/version and endpoint configuration.
- Do not expose human validation labels to Morrow.

## Gate (ADR-0012)

This arm is an offline experiment only. Before any Morrow call: run `npm run evaluation:ambiguity-census -- <frozen-run-dir>`, confirm `semanticReentry.frequencyGateMet` for a `text_semantic` rule, obtain human labels for that rule, and measure a deterministic baseline. See `docs/MORROW_EXECUTION_ARCHITECTURE.md`.

## Sequence

1. Run baseline axe and deterministic observatory for the selected cohort.
2. Freeze/copy the evidence packet.
3. Create semantic experiment inputs only for predeclared ambiguity classes.
4. Send those inputs to Morrow using the prompt in `evaluation/morrow/system-prompt.md`.
5. Validate every output with `SemanticExperimentOutputSchema` and `validateSemanticDecision`.
6. Store raw input/output pairs as experiment artifacts.
7. Human-review a sample without using Morrow as ground truth.
8. Compare deterministic vs Morrow-assisted human-review burden, precision and actionability.

## First afternoon run

Do not start with all 24 pilot municipalities.

Recommended:
- Riehen
- Allschwil
- Binningen
- Volken
- Maschwanden

These already exercise known field paths and keep debugging tractable.

Run deterministic evidence first. Only after that succeeds should Morrow be introduced.

## Stop conditions

Stop the semantic arm if:
- Morrow cites evidence not supplied;
- outputs repeatedly fail schema validation;
- the model expands beyond the decision space;
- latency makes the experiment impractical;
- semantic decisions do not reduce uncertainty/actionability burden.

A failed semantic experiment is a valid result.
