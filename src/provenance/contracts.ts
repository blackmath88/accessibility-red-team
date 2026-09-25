import { z } from "zod";

export const RequirementStrengthSchema = z.enum([
  "MANDATORY",
  "CONDITIONALLY_MANDATORY",
  "RECOMMENDED",
  "BEST_PRACTICE",
  "UNKNOWN",
]);

export const AuthorityClassSchema = z.enum([
  "LAW",
  "BINDING_STANDARD",
  "ADOPTED_POLICY",
  "TECHNICAL_STANDARD",
  "OFFICIAL_GUIDANCE",
  "BEST_PRACTICE",
]);

export const SourceAssertionSchema = z.object({
  id: z.string(),
  strength: RequirementStrengthSchema,
  statement: z.string(),
});

export const SourceRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  issuer: z.string(),
  jurisdiction: z.string(),
  authority_class: AuthorityClassSchema,
  url: z.string().url(),
  assertions: z.array(SourceAssertionSchema),
});

export const SourceRegistrySchema = z.object({
  schema: z.string(),
  as_of: z.string(),
  sources: z.array(SourceRecordSchema),
});

export const JurisdictionProfileSchema = z.object({
  schema: z.string(),
  id: z.string(),
  jurisdiction: z.string(),
  target_type: z.string(),
  as_of: z.string(),
  baseline: z.object({
    ech: z.object({
      id: z.string(),
      version: z.string(),
      strength: RequirementStrengthSchema,
      source_ref: z.string(),
    }).optional(),
    wcag: z.object({
      version: z.string(),
      level: z.enum(["A", "AA", "AAA"]),
      strength: RequirementStrengthSchema,
      incorporation_source_ref: z.string(),
    }),
  }),
  best_practice: z.object({
    wcag: z.object({
      version: z.string(),
      level: z.enum(["A", "AA", "AAA"]),
      strength: RequirementStrengthSchema,
    }).optional(),
  }).optional(),
  reporting: z.record(z.string(), z.unknown()).optional(),
});

export const ProvenanceLinkSchema = z.object({
  sourceId: z.string(),
  title: z.string(),
  issuer: z.string(),
  authorityClass: AuthorityClassSchema,
  url: z.string().url(),
  assertionId: z.string().nullable(),
  assertion: z.string(),
  strength: RequirementStrengthSchema,
});

export const RequirementResolutionSchema = z.object({
  framework: z.literal("WCAG"),
  criterion: z.string(),
  profileId: z.string(),
  profileAsOf: z.string(),
  status: z.enum(["APPLICABLE", "BEST_PRACTICE", "UNKNOWN"]),
  strength: RequirementStrengthSchema,
  standardVersion: z.string(),
  conformanceLevel: z.string(),
  chain: z.array(ProvenanceLinkSchema),
  explanation: z.string(),
});

export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;
export type JurisdictionProfile = z.infer<typeof JurisdictionProfileSchema>;
export type RequirementResolution = z.infer<typeof RequirementResolutionSchema>;
