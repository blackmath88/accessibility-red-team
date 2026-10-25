import { createHash } from "node:crypto";
import { z } from "zod";
import { JourneyOutcomeSchema } from "../journeys/contracts.js";
import {
  entryDigest,
  ProbeEntrySchema,
  ReviewerDecisionSchema,
  type ProbeDigests,
  type ProbeEntry,
  type ReviewerDecision,
} from "../catalogue/contracts.js";

export const requiredChallengeCategories = [
  "missing_target", "working_main", "no_recognizable_link", "non_main_target", "malformed_fragment", "independent_structure",
] as const;

export const ChallengeCaseSchema = z.object({
  caseId: z.string().min(1),
  category: z.enum(requiredChallengeCategories),
  expected: JourneyOutcomeSchema,
  actual: JourneyOutcomeSchema,
  supported: z.boolean(),
  freshContext: z.boolean(),
  independent: z.boolean(),
});

export const ValidationRecordSchema = z.object({
  schema: z.literal("art/probe-validation/v1"),
  probeId: z.string(),
  entryDigest: z.string(),
  implementationDigest: z.string(),
  cases: z.array(ChallengeCaseSchema),
});
export type ChallengeCase = z.infer<typeof ChallengeCaseSchema>;
export type ValidationRecord = z.infer<typeof ValidationRecordSchema>;

export function challengeCounts(cases: ChallengeCase[]) {
  return {
    cases: cases.length,
    falsePositives: cases.filter((item) => item.actual === "violation" && item.expected !== "violation").length,
    falseNegatives: cases.filter((item) => item.expected === "violation" && item.actual !== "violation").length,
    abstentions: cases.filter((item) => ["incomplete", "inapplicable", "error"].includes(item.actual)).length,
    unsupported: cases.filter((item) => !item.supported || (item.expected !== item.actual && item.actual !== "violation" && item.expected !== "violation")).length,
    unexpectedErrors: cases.filter((item) => item.actual === "error" && item.expected !== "error").length,
  };
}

// Evidence eligibility is deliberately separate from the human review command.
function evaluateValidation(entry: ProbeEntry, validationRecord: ValidationRecord, digests: ProbeDigests): {
  verdict: "eligible_for_review" | "rejected" | "insufficient_evidence";
  reasons: string[];
} {
  const parsed = ValidationRecordSchema.safeParse(validationRecord);
  if (!parsed.success) return { verdict: "insufficient_evidence", reasons: ["Invalid validation record."] };
  const record = parsed.data;
  const counts = challengeCounts(record.cases);
  const rejected: string[] = [];
  if (digests.entryDigest !== entryDigest(entry) || record.entryDigest !== digests.entryDigest
    || record.implementationDigest !== digests.implementationDigest || record.probeId !== entry.probeId) {
    rejected.push("Probe identity or entry/implementation digest mismatch.");
  }
  if (counts.falsePositives) rejected.push(`${counts.falsePositives} false positive(s).`);
  if (counts.falseNegatives) rejected.push(`${counts.falseNegatives} false negative(s).`);
  if (rejected.length) return { verdict: "rejected", reasons: rejected };

  const missing = requiredChallengeCategories.filter((category) => !record.cases.some((item) => item.category === category));
  const reasons: string[] = [];
  if (missing.length) reasons.push(`Missing challenge categories: ${missing.join(", ")}.`);
  if (new Set(record.cases.map((item) => item.caseId)).size !== record.cases.length) reasons.push("Duplicate challenge case IDs.");
  if (counts.unsupported) reasons.push(`${counts.unsupported} unsupported or unexpected non-claim outcome(s).`);
  if (counts.unexpectedErrors) reasons.push(`${counts.unexpectedErrors} unexpected error(s).`);
  if (record.cases.some((item) => !item.freshContext)) reasons.push("Each challenge needs a fresh browser context.");
  if (!record.cases.some((item) => item.category === "independent_structure" && item.independent)) reasons.push("Independent structure evidence is missing.");
  return reasons.length
    ? { verdict: "insufficient_evidence", reasons }
    : { verdict: "eligible_for_review", reasons: ["All required challenges matched; no false positives, false negatives or unsupported cases. Real human review is still required."] };
}

export type GateResult = {
  verdict: "eligible_for_review" | "rejected" | "insufficient_evidence";
  reasons: string[];
  binding: ProbeDigests & { probeId: string; validationRecordDigest: string };
};

export function evaluateGate(entry: ProbeEntry, validationRecord: ValidationRecord, digests: ProbeDigests): GateResult {
  return {
    ...evaluateValidation(entry, validationRecord, digests),
    binding: {
      ...digests,
      probeId: entry.probeId,
      validationRecordDigest: createHash("sha256").update(JSON.stringify(validationRecord)).digest("hex"),
    },
  };
}

export function applyReviewerDecision(entry: ProbeEntry, decision: ReviewerDecision, digests: ProbeDigests,
  gate?: { result: GateResult; validationRecord: ValidationRecord },
): {
  entry: ProbeEntry; applied: boolean; reason: string;
} {
  const review = ReviewerDecisionSchema.parse(decision);
  if (review.synthetic) return { entry: { ...entry }, applied: false, reason: "not applied: synthetic reviewer record" };
  if (digests.entryDigest !== entryDigest(entry) || review.entryDigest !== digests.entryDigest
    || review.implementationDigest !== digests.implementationDigest) {
    return { entry: { ...entry }, applied: false, reason: "not applied: entry/implementation digest mismatch" };
  }
  if (review.decision === "approve_trusted" && (!gate
    || gate.result.verdict !== "eligible_for_review"
    || JSON.stringify(gate.result) !== JSON.stringify(evaluateGate(entry, gate.validationRecord, digests)))) {
    return { entry: { ...entry }, applied: false, reason: "not applied: validation gate not eligible_for_review" };
  }
  const maturity = review.decision === "approve_trusted" ? "trusted" : review.decision === "reject" ? "retired" : "candidate";
  const updated = ProbeEntrySchema.parse({ ...entry, review, maturity });
  return { entry: updated, applied: true, reason: review.decision === "approve_trusted" ? "applied: trusted human approval" : `applied: review requires ${maturity} status` };
}
