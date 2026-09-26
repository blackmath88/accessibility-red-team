import { z } from "zod";

export const FindingChangeStateSchema = z.enum([
  "NEW",
  "PERSISTING",
  "RESOLVED",
  "RULE_CHANGED",
  "NOT_COMPARABLE",
]);

export const FindingChangeSchema = z.object({
  findingKey: z.string(),
  probeId: z.string(),
  state: FindingChangeStateSchema,
  previous: z.object({
    prevalence: z.number(),
    occurrenceCount: z.number().int().nonnegative(),
    affectedSurfaces: z.number().int().nonnegative(),
    probeVersion: z.string(),
  }).nullable(),
  current: z.object({
    prevalence: z.number(),
    occurrenceCount: z.number().int().nonnegative(),
    affectedSurfaces: z.number().int().nonnegative(),
    probeVersion: z.string(),
  }).nullable(),
});

export const JourneyChangeStateSchema = z.enum([
  "NEW",
  "REMOVED",
  "UNCHANGED",
  "OUTCOME_CHANGED",
  "RULE_CHANGED",
  "NOT_COMPARABLE",
]);

export const JourneyStateSchema = z.object({
  outcomes: z.array(z.string()),
  versions: z.array(z.string()),
  affectedSurfaces: z.number().int().nonnegative(),
  resultCount: z.number().int().nonnegative(),
});

export const JourneyChangeSchema = z.object({
  journeyId: z.string(),
  state: JourneyChangeStateSchema,
  previous: JourneyStateSchema.nullable(),
  current: JourneyStateSchema.nullable(),
});

export const WatchResultSchema = z.object({
  schema: z.literal("art/watch-result/v1"),
  generatedAt: z.string().datetime(),
  previousProfileId: z.string(),
  currentProfileId: z.string(),
  comparable: z.boolean(),
  reason: z.string().nullable(),
  summary: z.object({
    new: z.number().int().nonnegative(),
    persisting: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    ruleChanged: z.number().int().nonnegative(),
    notComparable: z.number().int().nonnegative(),
    journeyNew: z.number().int().nonnegative().default(0),
    journeyRemoved: z.number().int().nonnegative().default(0),
    journeyChanged: z.number().int().nonnegative().default(0),
    journeyUnchanged: z.number().int().nonnegative().default(0),
    journeyRuleChanged: z.number().int().nonnegative().default(0),
    journeyNotComparable: z.number().int().nonnegative().default(0),
  }),
  changes: z.array(FindingChangeSchema),
  journeys: z.array(JourneyChangeSchema).default([]),
  aiCalls: z.literal(0),
});

export type WatchResult = z.infer<typeof WatchResultSchema>;
