import { z } from "zod";
import { ArtifactSchema, RunSchema } from "./contracts.js";

export const CaseQueueItemSchema = z.object({
  caseId: z.string(),
  organizationId: z.string(),
  organizationName: z.string(),
  organizationType: z.string(),
  canton: z.string().nullable(),
  propertyId: z.string(),
  propertyUrl: z.string().url(),
  caseState: z.string(),
  latestRun: RunSchema.nullable(),
  artifactCounts: z.record(z.string(), z.number().int().nonnegative()),
  needsHumanReview: z.boolean(),
  nextAction: z.enum(["run", "review", "report", "outreach", "wait", "rescan"]),
});

export const CaseDetailSchema = z.object({
  queue: CaseQueueItemSchema,
  runs: z.array(RunSchema),
  artifacts: z.array(ArtifactSchema),
});

export type CaseQueueItem = z.infer<typeof CaseQueueItemSchema>;
export type CaseDetail = z.infer<typeof CaseDetailSchema>;
