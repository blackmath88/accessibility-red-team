# Campaign rehearsal-4

Status: completed (all planned work settled). Config v2, scope v1, plan revision 1, sessions 4.
Local fixtures only; rehearsal on known pages, not a blind result.

## Milestones
- 1. Understand scope: complete — 1/1 tasks in plan revision 1
- 2. Set strategy: complete — 1/1 tasks in plan revision 1
- 3. Discover and assess: complete — 6/6 tasks in plan revision 1
- 4. Investigate signals: complete — 2/2 tasks in plan revision 1
- 5. Reproduce and consolidate: complete — 1/1 tasks in plan revision 1
- 6. Deliver dossier: complete — 1/1 tasks in plan revision 1

## Cases
- case-shipping-second-a-390x844 (shipping): **supported** — OBSERVATION: The sentence is in a single <p> with the same rect on both pages ([57,552,280,80], about 4 lines of 20px, with right=337 inside the 390px viewport). On second-a the yellow .notice ancestor (#shipping-info) ends at y=602, 30px above the text's bottom edge at 632. On second-b it ends at 642, 10px below it. On second-a every sample point below that edge (rows 3–4) is missing from the hit stack entirely: the text is not covered, it is just not there. The band below the edge holds only u [evidence: baseline-shipping-second-a-390x844, inv-1-conclusion.json, replay-1.json]
- case-order-review-transfer-a-1440x900 (order-review): **rejected** — Covered by cached evidence t1-judged. The same pair was already investigated with transfer-b as the clean control. It found the same mechanism: the text-rect pixels are uniformly 239 and a layer is stacked above the note. A replay after the reveal resolved the cause as a layer drawn outside #deliver [evidence: baseline-order-review-transfer-a-1440x900]
- case-order-review-transfer-a-390x844 (order-review): **rejected** — The signature is identical to the 1440x900 unit (flat 239 pixels, covered 4/4, same attributed coverer). The cause is therefore the same defect already explained by cached evidence t1-judged, and a second investigation slot isn't justified. [evidence: baseline-order-review-transfer-a-390x844]

## Decisions
- 2026-10-30T11:13:17.548Z scope_understood: 2 user tasks, 4 local pages, 2 viewports, 1 cached evidence items; no live targets — scope is validated configuration; nothing outside it is admitted
- 2026-10-30T11:13:41.017Z strategy_set: Measure all four shipping units first, since that report is new and depends on the viewport. For order-review, re-measure only transfer-a at both viewports and rely on t1's judged evidence for the clean control transfer-b. (6 measured, 2 skipped) — Baseline measures cost no Claude invocations, so the plan covers every unit with real uncertainty. Shipping comes first because it is the only task with no prior evidence. Its report is specific to one viewport and also gives a desktop viewport that should pass, so the full 2x2 grid is what we need to tell the defect from the control before spending any of the 3 remaining invocations. The order-re
- 2026-10-30T11:14:08.917Z investigation_opened: second-a @ 390x844 vs second-b: At 390x844, is part of the yellow delivery-cost note on second-a cut off, so the rest of the sentence cannot be read? If so, what causes it: a clipping ancestor, overflow past the viewport, or a fixed height with overflow hidden? second-b at the same viewport is the control. — This is the only signal for the shipping task, and it matches the report: it appears only on mobile (the 1440x900 units for second-a are clean), 8 of 16 points are missing with no coverer, which points to clipping or overflow rather than occlusion, and second-b at 390x844 is clean (16/16 topmost). This uses 1 of 2 investigation slots.
- 2026-10-30T11:14:08.917Z signal_rejected: baseline-order-review-transfer-a-1440x900 — Covered by cached evidence t1-judged. The same pair was already investigated with transfer-b as the clean control. It found the same mechanism: the text-rect pixels are uniformly 239 and a layer is stacked above the note. A replay after the reveal resolved the cause as a layer drawn outside #delivery's box. The baseline matches exactly (no ink, 239 flat, covered 4/4), so reinvestigating adds nothi
- 2026-10-30T11:14:08.917Z signal_rejected: baseline-order-review-transfer-a-390x844 — The signature is identical to the 1440x900 unit (flat 239 pixels, covered 4/4, same attributed coverer). The cause is therefore the same defect already explained by cached evidence t1-judged, and a second investigation slot isn't justified.
- 2026-10-30T11:14:08.917Z triage_done: Opened 1 of 2 investigations: shipping/second-a at 390x844 against control second-b. Its signal is text missing from hit testing at half the sample points, only at the phone viewport, which fits the report of a delivery note cut off on mobile. Rejected both order-review/transfer-a units because they repeat the defect already investigated and resolved in cached evidence t1-judged, which used transfer-b as the clean control. In t1 the coverer was found to be a layer drawn outside #delivery's box, not section#delivery.card itself. All other units had no signals. — 3 decisions over 6 units
- 2026-10-30T11:17:43.508Z investigation_concluded: case-shipping-second-a-390x844: supported (high confidence) — OBSERVATION: The sentence is in a single <p> with the same rect on both pages ([57,552,280,80], about 4 lines of 20px, with right=337 inside the 390px viewport). On second-a the yellow .notice ancestor (#shipping-info) ends at y=602, 30px above the text's bottom edge at 632. On second-b it ends at 642, 10px below it. On second-a every sample point below that edge (rows 3–4) is missing from the hit
- 2026-10-30T11:17:44.618Z replay_compared: second-a @ 390x844: signals reproduced; control second-b: no signal — fresh broker session, same fixed baseline probe

## Failures
- none

## Resources
- Claude invocations: 6/8 (failed 1); wall 215 s of 30 min; concurrency 2.
- Measured tokens (4 calls with usage, 1 without): input 8, cache creation 13522, cache read 24481, output 17398 (thinking 8425). Target 500000/60000 is a target, not an enforced ceiling.

## Open work

## Limitations
- Output tokens per call cannot be capped with the installed CLI; invocations, wall time and concurrency are the enforced limits.
- Screenshots are recorded as evidence; no model inspected them.
