import { z } from "zod";
import { FrontierLedgerSchema, type FrontierLedger, type FrontierObligation } from "../contracts.js";

export const AssessmentSchema = z.strictObject({
  obligationId: z.string(), outcome: z.enum(["pass", "violation", "inapplicable", "incomplete", "inconclusive", "error"]),
  evidenceIds: z.array(z.string()).min(1),
});
export type Assessment = z.infer<typeof AssessmentSchema>;

// An audit projection, not a replacement for the execution ledger and not a publication/adjudication command.
export function auditObligation(obligation: FrontierObligation, input?: Assessment) {
  const assessment = input ? AssessmentSchema.parse(input) : null;
  if (assessment && (assessment.obligationId !== obligation.id || obligation.status !== "executed"
    || assessment.evidenceIds.some((id) => !obligation.evidenceIds.includes(id)))) {
    throw new Error("assessment must cite this executed obligation's recorded evidence");
  }
  const outcome = assessment?.outcome ?? "unassessed";
  return {
    obligationId: obligation.id, execution_status: obligation.status, assessment_outcome: outcome,
    follow_up_required: outcome !== "pass" && outcome !== "inapplicable",
    barrier_adjudication: null,
  };
}

// Recover persisted bookkeeping for inspection. There is no executor/browser/scheduler state restoration here.
export function recoverLedger(json: string): FrontierLedger {
  return FrontierLedgerSchema.parse(JSON.parse(json));
}
