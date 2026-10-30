# AIL blind transfer cases t1 and t2 (local fixtures only)

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

## Review and limits

- **Independent read-only review** of `e8f611c`, by a fresh Claude subagent: 4 major and 6 minor findings, fixed in `95b1b3d`. The gate now validates the exact `probe.mjs` file, a `reveal` stage enforces the freeze, the contract's `open` rules match the broker, WebSockets are refused, spend paths must be absolute and the floor strict, names are checked, and duplicate detection ignores comments and whitespace. A fresh read-only re-review of `93e0f9e` verified all 10 fixes and found 1 major and 4 minor new defects:
  - a conclusion suffix containing a hyphen escaped the freeze;
  - design was still allowed after a reveal;
  - the duplicate normaliser stripped text inside strings;
  - conclude and design ledger names could collide;
  - reveal hashed only the conclusions.

  These were fixed with tests in the commit that adds `transfer-rules.ts`. The remaining conclude/reveal race is now closed: both stages take one exclusive per-run lock (`run.lock`, O_EXCL), and a second holder is refused rather than queued. A lock left by a killed process must be removed by hand after checking that nothing is in flight. A focused read-only review of `b3e2119` found no blocker or major issues. Its minor findings: design, validate and execute are not under the lock, but reveal hashes would show any later change; reveal did not hash screenshots (it now hashes them as bytes); and the lock test exercises the helper, not the CLI wiring.
- **t1 reveal marker.** t1's `revealed.json` was written by a coordinator script before the `reveal` stage existed. Its hashes were verified by the judge.
- **Not counted as loads.** A same-origin iframe can load the approved URL again without it being counted as a top-level load. Neither sub-resource policy is complete network containment.

## t1 reasoning replay (post-reveal, not a blind result)

The same recorded d3 measurements for both pages (complete, about 26 KB, nothing truncated) and the probe source went to fresh contexts. Each prompt required a citation for every causal claim and asked for contradictory evidence, kept separate from observation, explanation and uncertainty. The answer key, judgment, earlier conclusions and the coordinator's diagnosis were withheld, and the prompt did not name any contradiction. Each response was frozen (wx, hashed) before it was compared with the key. The original t1 conclusion is unchanged.

| Context | Page | Geometry/paint mismatch | Avoids the white-box claim | Unobservable mechanism marked |
|---|---|---|---|---|
| Original t1 conclusion (blind; mistral-small-2603, 9,000-character cap) | correct | no | no | partly |
| Replay: claude-opus-5-5 (tool-less `claude -p`, subscription) | correct | yes | yes | yes |
| Replay: mistral-small-2603, identical prompt (USD 0.0033) | **wrong** (the control) | no | vacuous | partly |

With prompt and measurements held fixed, the model is the difference. Caveats: the prompt was written after the reveal, and the four criteria were scored by the coordinator. Evidence is in `evidence/replay/`.

## t2: second blind case, Claude as lead investigator

- **Fixture.** An independent Claude subagent wrote a new pair whose defect uses a different mechanism; the two pages differ by one CSS line. The key and its screenshots were sealed outside git. The author named the pages case2-a/b; the coordinator renamed them second-a/b, because broker fixture names allow only letters and hyphens. The key keeps the old names.
- **Investigator.** claude-opus-5-5 through tool-less `claude -p` from an empty directory. It saw only the existing designer brief (symptom, broker contract, page names) and, in a second call, its own proposal and the complete recorded results. It could revise once or conclude, and it concluded. The coordinator only shuttled files, through new `brief`, `import` and `import-conclusion` stages. Those stages use the same schema, gate, freeze rules and lock as before; the broker and its measurement capabilities are unchanged.
- **Gate and execution.** d1 passed the gate first time (dry run 32 calls, none denied) and ran on both local pages at both viewports. Nothing was blocked.
- **Result.** The conclusion was frozen under the lock and then revealed. A fresh Claude judge found it **correct**: second-a is defective at 390x844, because a fixed-height notice (60 px, ending at y 602) clips its 80 px paragraph, which the hit tests no longer find below y 602. The investigator inferred `overflow:hidden` and flagged it as not observable through the broker. Minor issues: it called the control's height "auto" when it is min-height, and its button-colour match is loose. The judge found no blindness breach.
- **Failures kept.**
  - The probe ignored `packet.viewport` and opened both viewports itself, so each record holds duplicate runs and the artifact names carry the wrong viewport label. The investigator noticed this.
  - Its screenshot field is empty, and it never looked at the PNGs.
- **Spend.** No Mistral calls for t2. Claude calls went through the subscription; the CLI reports a nominal USD 0.22 + 0.37 for the investigator and 0.29 for the replay, none of it billed to an API key.
