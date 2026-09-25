import { z } from "zod";
import { ProbeResultSchema } from "../contracts.js";
import { RequirementResolutionSchema } from "../provenance/contracts.js";

export const ReportFindingSchema = z.object({
  probe: ProbeResultSchema,
  requirements: z.array(RequirementResolutionSchema),
});

export const AccessibilityReportSchema = z.object({
  schema: z.literal("art/accessibility-report/v1"),
  generatedAt: z.string().datetime(),
  profileId: z.string(),
  target: z.object({
    requestedUrl: z.string().url(),
    finalUrl: z.string().url(),
  }),
  summary: z.object({
    violations: z.number().int().nonnegative(),
    incomplete: z.number().int().nonnegative(),
    applicable: z.number().int().nonnegative(),
    bestPractice: z.number().int().nonnegative(),
    unknownApplicability: z.number().int().nonnegative(),
  }),
  findings: z.array(ReportFindingSchema),
  aiCalls: z.literal(0),
});

export type AccessibilityReport = z.infer<typeof AccessibilityReportSchema>;
