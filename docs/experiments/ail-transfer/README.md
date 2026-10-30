# AIL blind transfer case t1 (local fixtures only)

One unfamiliar local case, used to see whether the checked investigation loop transfers beyond the Basel hint. **One case is a demonstration, not a benchmark or proof of general reliability.** No public site was contacted.

## Setup

- **Fixtures.** An independent Orca worker (claude-opus-5-5) wrote two neutral pages, `test/fixtures/investigation/transfer-a.html` and `transfer-b.html` (commit 78c768c). One page has a defect and the other is a clean control; a coin flip decided which. The worker also wrote a sealed answer key and the symptom outside git. The coordinator did not open the pages or the key until the conclusion was frozen.
- **Designer input.** The designer received only the reported symptom, the machine-readable broker contract (`src/experimental/investigation/broker-contract.ts`) and the two page names.
- **Gate before execution** (`transfer.ts validate`), applied to every attempt:
  - a duplicate-code check;
  - a static scan of broker ops;
  - a dry run in the sandbox against a contract mock, with no denied calls allowed;
  - for each revision, the critic's executable checks.
- **Revision notes.** A designer's revisionNote is treated as a claim. Only the gate's results count as evidence that the code changed.

## What happened

| Step | Who | Result |
|---|---|---|
| d1 design | Mistral `mistral-small-2603` | Passed the gate. It ran on both pages at 1440×900 and 390×844 and returned one `isCovered` boolean (true on a, false on b). It measured no pixels. |
| d1 critique | Claude critic, blind | 8 required changes and 5 executable checks: text-rect and reference pixels, all stack entries above the text, own colours and ancestors, every match, a screenshot. |
| d2 revision | Mistral (the one allowed revision) | **Failed the gate.** It crashed on the contract mock, and all 5 checks failed, although its revisionNote claimed every change. |
| d3 escalation | Claude, blind, recorded as an escalation | Passed the gate on the first try and ran on both pages. |
| Conclusion 1 | Mistral | "Undetermined". **Coordinator defect:** the stage cut the input at 20,000 characters, which dropped transfer-b. A call before this one failed schema parsing, and its raw text was not kept. |
| Conclusion 2 | Mistral, from complete per-page input | **transfer-a is defective**, high confidence. Frozen before the reveal; both hashes are in `revealed.json`. |
| Judge | Fresh Claude, after the reveal | **Partially correct.** The page and the separation from the control are right: transfer-a's text pixels are uniformly 239, while transfer-b has ink down to 85 (p05 147/111), and there is a stack entry above the text only on a. The mechanism is attributed to `#delivery`'s white box, but that box starts below the text and the covering paint is 239, not 255; the key lists that reading as unsupported. The judge found no fixture-specific code. |

## Interventions and cost

- **Coordinator interventions:**
  - starting the Claude critic;
  - escalating once to Claude (d3);
  - relaxing the conclusion schema (list items may be objects);
  - fixing the truncated conclusion input, with one corrected conclusion before the reveal.
- **Handwritten measurement code:** none in t1.
- **Mistral cost:** 5 calls, USD 0.00944. The aggregate across all ledgers is now USD 0.1009 of the USD 5 cap.
- **Claude:** the critic, the escalation and the judge ran as subscription subagents; no API route was used.

## Evidence

`evidence/` holds:
- proposals, probes and gate results for d1–d3;
- the d1 critique;
- both conclusions;
- `revealed.json`;
- the answer key, the symptom and the judgment;
- `measurements.json`, the full d1/d3 results;
- the designer ledgers.

The committed `answer-key.json` has one local path replaced, so its hash differs from the sealed original. The original's hash is in `revealed.json` (67bbc20d…).

**Open:** d3 records a null screenshot artifact in its result, although the broker saved the PNGs.
