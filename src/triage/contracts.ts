import { z } from "zod";

export const FindingOccurrenceSchema = z.object({
  surfaceId: z.string(),
  url: z.string().url(),
  target: z.array(z.string()),
  html: z.string(),
  failureSummary: z.string().nullable(),
});

export const EvidenceFindingSchema = z.object({
  schema: z.literal("art/evidence-finding/v1"),
  findingId: z.string(),
  probeId: z.string(),
  probeVersion: z.string(),
  outcome: z.enum(["violation", "incomplete"]),
  impact: z.enum(["minor", "moderate", "serious", "critical", "unknown"]),
  help: z.string(),
  helpUrl: z.string().url(),
  tags: z.array(z.string()),
  requirements: z.array(z.object({
    framework: z.literal("WCAG"),
    criterion: z.string(),
    sourceTag: z.string(),
  })),
  affectedSurfaces: z.number().int().nonnegative(),
  occurrenceCount: z.number().int().nonnegative(),
  prevalence: z.number().min(0).max(1),
  templateLeverage: z.enum(["single_surface", "repeated"]),
  occurrences: z.array(FindingOccurrenceSchema),
});

export const TriageResultSchema = z.object({
  schema: z.literal("art/triage-result/v1"),
  generatedAt: z.string().datetime(),
  totalSurfaces: z.number().int().nonnegative(),
  findings: z.array(EvidenceFindingSchema),
  aiCalls: z.literal(0),
});

export type EvidenceFinding = z.infer<typeof EvidenceFindingSchema>;
export type TriageResult = z.infer<typeof TriageResultSchema>;
