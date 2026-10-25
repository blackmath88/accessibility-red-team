// Evaluator-only answer keys. Neither packets nor providers nor browser tools import this module.
import type { Point } from "./packets.js";
import type { ReplayAnswer } from "./runner.js";

export type AnswerKey = { action: ReplayAnswer["action"]; interpretation: string };
export const EVALUATOR_ANSWERS: Record<Point, AnswerKey> = {
  missed_sibling: { action: { type: "navigate", url: "/s/b.html" }, interpretation: "sibling_unobserved" },
  dialog_focus: { action: { type: "capture_evidence", targetRef: "e2" }, interpretation: "focus_return_not_observed" },
};

export function scoreAnswer(answer: ReplayAnswer, key: AnswerKey) {
  return {
    nextAction: Object.entries(key.action).every(([field, value]) => (answer.action as Record<string, unknown>)[field] === value),
    evidenceInterpretation: answer.interpretation === key.interpretation,
  };
}
