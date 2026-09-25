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
  }),
  changes: z.array(FindingChangeSchema),
  aiCalls: z.literal(0),
});

export type WatchResult = z.infer<typeof WatchResultSchema>;
