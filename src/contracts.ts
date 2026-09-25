import { z } from "zod";

export const ImpactSchema = z.enum(["minor", "moderate", "serious", "critical", "unknown"]);
export const ProbeOutcomeSchema = z.enum(["pass", "violation", "incomplete", "inapplicable", "error"]);

export const EvidenceNodeSchema = z.object({
  target: z.array(z.string()),
  html: z.string(),
  failureSummary: z.string().nullable(),
});

export const RequirementRefSchema = z.object({
  framework: z.literal("WCAG"),
  criterion: z.string(),
  sourceTag: z.string(),
});

export const ProbeResultSchema = z.object({
  schema: z.literal("art/probe-result/v1"),
  probeId: z.string(),
  probeVersion: z.string(),
  surfaceId: z.string(),
  stateId: z.string(),
  outcome: ProbeOutcomeSchema,
  impact: ImpactSchema,
  help: z.string(),
  helpUrl: z.string().url(),
  tags: z.array(z.string()),
  requirements: z.array(RequirementRefSchema),
  nodes: z.array(EvidenceNodeSchema),
});

export type ProbeResult = z.infer<typeof ProbeResultSchema>;

export const SurfaceSnapshotSchema = z.object({
  schema: z.literal("art/surface-snapshot/v1"),
  runId: z.string(),
  surfaceId: z.string(),
  stateId: z.string(),
  requestedUrl: z.string().url(),
  finalUrl: z.string().url(),
  title: z.string(),
  language: z.string().nullable(),
  retrievedAt: z.string().datetime(),
  contentSha256: z.string().length(64),
  htmlBytes: z.number().int().nonnegative(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  screenshot: z.string(),
});

export type SurfaceSnapshot = z.infer<typeof SurfaceSnapshotSchema>;

export const ScanSummarySchema = z.object({
  schema: z.literal("art/scan-summary/v1"),
  runId: z.string(),
  requestedUrl: z.string().url(),
  finalUrl: z.string().url(),
  counts: z.object({
    violations: z.number().int().nonnegative(),
    incomplete: z.number().int().nonnegative(),
    passes: z.number().int().nonnegative(),
    inapplicable: z.number().int().nonnegative(),
  }),
  wcagCriteriaObserved: z.array(z.string()),
});

export type ScanSummary = z.infer<typeof ScanSummarySchema>;
