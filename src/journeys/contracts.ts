import { z } from "zod";

export const JourneyOutcomeSchema = z.enum([
  "pass",
  "violation",
  "incomplete",
  "inapplicable",
  "error",
]);

export const JourneyKindSchema = z.enum([
  "keyboard_focus",
  "skip_link",
  "expandable",
  "dialog",
]);

export const JourneyEvidenceSchema = z.object({
  action: z.string(),
  selector: z.string().nullable(),
  before: z.record(z.string(), z.unknown()).optional(),
  after: z.record(z.string(), z.unknown()).optional(),
  note: z.string().optional(),
});

export const JourneyResultSchema = z.object({
  schema: z.literal("art/journey-result/v1"),
  journeyId: z.string(),
  journeyVersion: z.string(),
  kind: JourneyKindSchema,
  surfaceId: z.string(),
  url: z.string().url(),
  outcome: JourneyOutcomeSchema,
  title: z.string(),
  summary: z.string(),
  evidence: z.array(JourneyEvidenceSchema),
  safety: z.object({
    submittedForms: z.literal(false),
    followedExternalLinks: z.literal(false),
    wroteServerState: z.literal(false),
  }),
  aiCalls: z.literal(0),
});

export const JourneyRunSchema = z.object({
  schema: z.literal("art/journey-run/v1"),
  generatedAt: z.string().datetime(),
  surfaceId: z.string(),
  url: z.string().url(),
  results: z.array(JourneyResultSchema),
  aiCalls: z.literal(0),
});

export type JourneyResult = z.infer<typeof JourneyResultSchema>;
export type JourneyRun = z.infer<typeof JourneyRunSchema>;
