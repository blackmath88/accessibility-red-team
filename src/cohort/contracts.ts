import { z } from "zod";

export const CohortSchema = z.object({
  schema: z.literal("art/cohort/v1"),
  id: z.string(),
  name: z.string(),
  as_of: z.string(),
  profile: z.string(),
  settings: z.object({
    max_pages: z.number().int().positive(),
    max_depth: z.number().int().nonnegative(),
    max_surfaces: z.number().int().positive().optional(),
  }),
  sites: z.array(z.object({
    id: z.string(),
    name: z.string(),
    url: z.string().url(),
    note: z.string().optional(),
  })),
});

export const CohortResultSchema = z.object({
  schema: z.literal("art/cohort-result/v1"),
  cohortId: z.string(),
  generatedAt: z.string().datetime(),
  profileId: z.string(),
  aiCalls: z.literal(0),
  issueFamilies: z.array(z.object({
    probeId: z.string(),
    outcome: z.enum(["violation", "incomplete"]),
    municipalityCount: z.number().int().nonnegative(),
    occurrenceCount: z.number().int().nonnegative(),
    municipalities: z.array(z.string()),
  })),
  sites: z.array(z.object({
    id: z.string(),
    name: z.string(),
    url: z.string().url(),
    status: z.enum(["PASS", "ERROR"]),
    selectedSurfaces: z.number().int().nonnegative().optional(),
    findings: z.number().int().nonnegative().optional(),
    repeatedFindings: z.number().int().nonnegative().optional(),
    needsReview: z.number().int().nonnegative().optional(),
    applicableFindings: z.number().int().nonnegative().optional(),
    error: z.string().optional(),
    reportPath: z.string().optional(),
  })),
});
