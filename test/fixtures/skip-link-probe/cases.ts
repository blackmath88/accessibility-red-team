import type { ChallengeCase } from "../../../src/promotion/gate.js";

// Expectations fixed before executing the extracted detector. The independent layout
// exercises existing German text recognition and role=main without detector tuning.
export const challengeCases: Array<{ file: string; category: ChallengeCase["category"]; expected: ChallengeCase["expected"]; summary: string }> = [
  { file: "missing-target", category: "missing_target", expected: "violation", summary: "A skip link was found but its same-page target does not exist." },
  { file: "working-main", category: "working_main", expected: "pass", summary: "Skip link resolves to a main-content landmark." },
  { file: "no-recognizable-link", category: "no_recognizable_link", expected: "inapplicable", summary: "No recognizable same-page skip link was found." },
  { file: "non-main-target", category: "non_main_target", expected: "incomplete", summary: "Skip link target exists, but its bypass semantics need review." },
  { file: "malformed-fragment", category: "malformed_fragment", expected: "incomplete", summary: "Skip link fragment could not be decoded; its target needs review." },
  { file: "independent-structure", category: "independent_structure", expected: "pass", summary: "Skip link resolves to a main-content landmark." },
];
