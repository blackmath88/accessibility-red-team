# skip-link.same-page — bounded target observation

Status: **candidate**, pending a real human review. No reviewer decision has been
recorded, and passing validation does not change maturity or authorize publication.
This entry wraps the existing journey; it does not claim discovery of a new barrier.

## Claim and implementation

For the first recognizable link among at most 20 anchors with `href` beginning
with `#`, the probe reports `violation` when no element has the decoded fragment
ID in the inspected document. `pass` observes that the existing target is a
`main` element or has `role="main"`. The wrapper returns the original
`JourneyResult` unchanged, alongside probe identity, implementation version and
digests. The journey ID remains `skip-link.same-page`, its result version remains
`journeys/0.1`, and the catalogue implementation version is
`journeys/0.1+malformed-fragment.1`.

The only detector change is handling a fragment that `decodeURIComponent`
cannot decode: it returns `incomplete`, with the original href and an explanatory
summary, instead of allowing a URI error to escape the journey. Existing
well-formed-input outcomes, summaries, evidence and safety fields are preserved.

| Outcome | Meaning in this catalogue |
| --- | --- |
| violation | claim: the sampled recognized skip link has a missing target |
| pass | no_claim: an existing main-content landmark target was observed |
| incomplete | abstain: existing non-main target or malformed fragment needs review |
| inapplicable | abstain: no recognizable link in the bounded sample |
| error | abstain: no barrier claim is authorized |

## Limitations and deployment scope

- Inspects at most 20 fragment links in DOM order; stops at the first recognizable
  nonempty fragment (or explicitly abstains on its malformed encoding).
- Uses the existing case-insensitive text expression
  `skip|jump|zum inhalt|zum hauptinhalt|direkt zum`. Other languages, accessible
  names without matching text content, later links, frames and shadow structures
  are not established coverage.
- An existing non-main target is `incomplete`; it is not asserted to be a barrier.
  No recognizable link is `inapplicable`, not evidence that a bypass barrier is absent.
- Does not activate the link or prove keyboard bypass behaviour, focus movement,
  screen-reader usability, or WCAG conformance. A `pass` is only a structural observation.
- Assumes a settled document and Playwright DOM/locator support. Browser or page
  execution failures are not converted into missing-target violations.
- Intended deployment is internal shadow observations only. Six static fixture
  challenges establish bounded reproducibility, not generalisability to properties
  or permission for population reporting.

Required evidence is recognized text/href, target existence for a claim, tag/role
for a pass, and a fresh context for each validation challenge. German remediation:
Das Sprunglink-Ziel muss als eindeutige ID im selben Dokument vorhanden sein.
Tastaturbedienung und Fokusführung zusätzlich manuell prüfen.

## Challenge results

Executed with real Playwright Chromium, static `file://` HTML, and a fresh browser
context per case; no public site, AI call or external service is used. Expectations
are recorded in `test/fixtures/skip-link-probe/cases.ts`. The independent structure
uses a `role="main"` div, German text `Direkt zum Inhalt`, nested layout and decoy
fragment links; it was authored separately from the simple fixtures and did not
cause detector tuning. It is a local independent challenge, not a previously
unseen real-world holdout or a statistical generalisation result.

| Fixture | Expected | Actual | FP | FN | Abstention | Unsupported |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| missing-target | violation | violation | 0 | 0 | 0 | 0 |
| working-main | pass | pass | 0 | 0 | 0 | 0 |
| no-recognizable-link | inapplicable | inapplicable | 0 | 0 | 1 | 0 |
| non-main-target | incomplete | incomplete | 0 | 0 | 1 | 0 |
| malformed-fragment | incomplete | incomplete | 0 | 0 | 1 | 0 |
| independent-structure | pass | pass | 0 | 0 | 0 | 0 |
| **Total (6)** | | | **0** | **0** | **3** | **0** |

Unexpected errors: **0**. A false positive means actual `violation` with any
non-violation expectation. A false negative means an expected `violation` was
not reported, including a miss through abstention. Abstention counts every
`incomplete`, `inapplicable` or `error` outcome. Unsupported counts explicit
unsupported cases or unexpected non-claim outcomes; the malformed-fragment
case is supported as a deliberate abstention, so it is not an unsupported case.
These are raw fixture counts, not estimated real-world error rates.

Gate output for the actual browser-derived record: **eligible_for_review**.
Reason: all required challenges matched, with no false positives, false negatives
or unsupported cases; real human review is still required. The test emits the
complete expected/actual case record, digests and gate output as diagnostics.
The gate also rejects changed digests or any FP/FN, and returns
`insufficient_evidence` for missing challenge categories, unsupported/unexpected
errors, reused contexts, duplicate case IDs or missing independent provenance.
The gate is pure and never changes entry maturity.

## Review binding and legacy vocabulary

`entryDigest(entry)` hashes SHA-256 of recursively key-sorted canonical JSON,
excluding only `review` and `maturity`; array order is preserved. Claim, scope,
limitations, implementation version and validation references are therefore
review-bound. `implementationDigest(sourceText)` hashes the exact skip-link
implementation module source text. The registry reads the TypeScript module
under tsx and emitted JavaScript under node; those runtime artifacts have different
digests and require corresponding approvals. This deliberately uses real source
hashing rather than a manually maintained version constant. The digest covers
this detector module, not the entire dependency or browser supply chain.

Digests observed for the validated TypeScript runtime in this packet:

```text
entryDigest:          523510a6ac5534581e3bde030bf6f59fa73deb021082f55d617ecebc203006ef
implementationDigest: fe098846cf9fc03cd049f4219a08abd512e30a5efc3704d72d9facca1678f15b
```

These identify the reviewed inputs; they are not signatures or proof of reviewer
authority. The emitted JavaScript implementation digest was independently read
successfully from `dist/src/catalogue/registry.js` after the build.

`applyReviewerDecision` is a pure decision-record operation. An `approve_trusted`
record must be non-synthetic and match both current digests before it returns a
new trusted entry. `isTrustedEligible` additionally checks trusted maturity and
recomputes the entry digest: changing the implementation or claim invalidates a
prior approval. Caller-supplied reviewer identity is not authentication; an
external authorized human-review workflow must establish that authority. No such
review service or production publication integration is implemented here.

Policy tests use synthetic validation records and reviewer records, including
explicitly labelled unit inputs with `synthetic: false` to exercise the human
record branch. Those inputs are not actual human sign-off and are never written
to the registry. Records with `synthetic: true` return exactly
`not applied: synthetic reviewer record`. The shipped entry stays **candidate**,
with `review: null`, pending a real human decision after evidence review.

The origin source type reuses `CandidateCheck`'s `journey_gap` vocabulary directly.
`candidateStatusToMaturity` documents the legacy mapping: `OBSERVED` becomes
`experimental`; `CANDIDATE`, `VALIDATED` and `PROMOTED` become `candidate`;
`REJECTED` and `DEPRECATED` become `retired`. Legacy `PROMOTED` alone never means
trusted. The adaptive aria-controls classifier remains a separate experiment.

## Verification

- `npm ci`: completed once for this worktree.
- `npm run build`: passed (TypeScript compiler, exit 0).
- `npx tsx --test test/journeys.test.ts test/catalogue-*.test.ts test/promotion-*.test.ts test/skip-link-*.test.ts`:
  25 passed, 0 failed, 0 skipped; includes six challenge subtests.
- `npm test`: did not complete normally; the `adaptive-arms.test.ts` shared
  before hook exceeded 120 seconds and retained open handles. After more than
  five minutes, only this run's process tree was stopped (exit 143). Output had
  3 passed address tests and 19 cancelled adaptive-arm tests; no aggregate summary
  was produced, so full pass/fail totals are unavailable for this invocation.
- Exact-base comparison: archived commit
  `3065bc2fe655c325b360c20b2480fbfb0fd77722`, with the same installed dependencies,
  reproduced the normal full suite's 120-second hook timeout and retained handles;
  that comparison tree was also stopped (exit 143, same partial 3/19 output).
- Additional bounded full-suite diagnostic:
  `npx tsx --test --test-concurrency=4 --test-timeout=180000 --test-force-exit test/*.test.ts`:
  **265 passed, 1 failed, 0 cancelled, 0 skipped**, 266 tests total (exit 1).
  The sole failure is `test/adaptive-arms.test.ts:147`: the malicious fixture
  expects `dynamicAdvantage.comparable === false`, but observes `true`.
- Exact-base isolated reproduction:
  `timeout 240s ./node_modules/.bin/tsx --test test/adaptive-arms.test.ts`:
  **18 passed, 1 failed, 0 cancelled, 0 skipped** (exit 1), reproducing that same
  assertion at line 147 on commit `3065bc2`. No adaptive source or test was edited.

Additional regression coverage checks the unchanged 20-link sampling boundary,
first-recognizable-link behavior, empty fragment handling, valid percent-encoded
IDs, digest staleness, all challenge categories, unsupported evidence and synthetic
review refusal. The original `test/journeys.test.ts` remains unchanged.
