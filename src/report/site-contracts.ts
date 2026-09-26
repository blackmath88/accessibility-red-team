import { z } from "zod";
import { EvidenceFindingSchema } from "../triage/contracts.js";
import { RequirementResolutionSchema } from "../provenance/contracts.js";

export const SiteReportFindingSchema = z.object({
  finding: EvidenceFindingSchema,
  requirements: z.array(RequirementResolutionSchema),
});

export const SiteJourneySummarySchema = z.object({
  journeyId: z.string(),
  journeyVersion: z.string(),
  kind: z.string(),
  outcome: z.enum(["pass", "violation", "incomplete", "inapplicable", "error"]),
  affectedSurfaces: z.number().int().nonnegative(),
  resultCount: z.number().int().nonnegative(),
  surfaceIds: z.array(z.string()),
  summaries: z.array(z.string()),
});

export const SiteAccessibilityReportV1Schema = z.object({
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

export const SiteAccessibilityReportV2Schema = z.object({
  schema: z.literal("art/site-accessibility-report/v2"),
  generatedAt: z.string().datetime(),
  profileId: z.string(),
  entrypoint: z.string().url(),
  totalSurfaces: z.number().int().nonnegative(),
  summary: z.object({
    findings: z.number().int().nonnegative(),
    repeatedFindings: z.number().int().nonnegative(),
    applicableFindings: z.number().int().nonnegative(),
    needsReview: z.number().int().nonnegative(),
    journeyPasses: z.number().int().nonnegative(),
    journeyNeedsReview: z.number().int().nonnegative(),
    journeyViolations: z.number().int().nonnegative(),
  }),
  findings: z.array(SiteReportFindingSchema),
  journeys: z.array(SiteJourneySummarySchema),
  aiCalls: z.literal(0),
});

export const SiteAccessibilityReportSchema = z.union([
  SiteAccessibilityReportV1Schema,
  SiteAccessibilityReportV2Schema,
]);

export type SiteAccessibilityReport = z.infer<typeof SiteAccessibilityReportV2Schema>;
