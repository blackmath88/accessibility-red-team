import { z } from "zod";
import { EvidenceFindingSchema } from "../triage/contracts.js";
import { RequirementResolutionSchema } from "../provenance/contracts.js";

export const SiteReportFindingSchema = z.object({
  finding: EvidenceFindingSchema,
  requirements: z.array(RequirementResolutionSchema),
});

export const SiteAccessibilityReportSchema = z.object({
  schema: z.literal("art/site-accessibility-report/v1"),
  generatedAt: z.string().datetime(),
  profileId: z.string(),
  entrypoint: z.string().url(),
  totalSurfaces: z.number().int().nonnegative(),
  summary: z.object({
    findings: z.number().int().nonnegative(),
    repeatedFindings: z.number().int().nonnegative(),
    applicableFindings: z.number().int().nonnegative(),
    needsReview: z.number().int().nonnegative(),
  }),
  findings: z.array(SiteReportFindingSchema),
  aiCalls: z.literal(0),
});

export type SiteAccessibilityReport = z.infer<typeof SiteAccessibilityReportSchema>;
