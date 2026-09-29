import { z } from "zod";

export const ValidationLabelSchema = z.enum(["confirmed", "false_positive", "uncertain", "duplicate", "not_reviewed"]);
export const ActionabilitySchema = z.enum(["actionable", "needs_context", "not_actionable", "not_reviewed"]);

export const EvaluationFindingSchema = z.object({
  id: z.string(),
  source: z.enum(["baseline_axe", "observatory_static", "observatory_behavioral"]),
  ruleId: z.string(),
  surfaceId: z.string(),
  outcome: z.enum(["violation", "incomplete", "pass", "inapplicable", "error"]),
  nodeCount: z.number().int().nonnegative(),
  requirements: z.array(z.string()),
  summary: z.string(),
  validation: ValidationLabelSchema.default("not_reviewed"),
  actionability: ActionabilitySchema.default("not_reviewed"),
  reviewerNote: z.string().default(""),
});

export const SiteEvaluationSchema = z.object({
  schema: z.literal("art/site-evaluation/v1"),
  siteId: z.string(),
  name: z.string(),
  url: z.string().url(),
  baseline: z.object({ ruleResults: z.number().int().nonnegative(), affectedNodes: z.number().int().nonnegative() }),
  observatory: z.object({
    staticRuleResults: z.number().int().nonnegative(),
    staticAffectedNodes: z.number().int().nonnegative(),
    behavioralResults: z.number().int().nonnegative(),
    humanReviewResults: z.number().int().nonnegative(),
  }),
  findings: z.array(EvaluationFindingSchema),
});

export type EvaluationFinding = z.infer<typeof EvaluationFindingSchema>;
