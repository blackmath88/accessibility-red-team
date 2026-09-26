import { z } from "zod";

export const CapabilityModeSchema = z.enum([
  "DETERMINISTIC",
  "BEHAVIORAL",
  "SEMANTIC",
  "HUMAN",
]);

export const CapabilityStrengthSchema = z.enum(["NONE", "WEAK", "PARTIAL", "STRONG"]);

export const RequirementCapabilitySchema = z.object({
  schema: z.literal("art/requirement-capability/v1"),
  framework: z.literal("WCAG"),
  criterion: z.string(),
  deterministic: CapabilityStrengthSchema,
  behavioral: CapabilityStrengthSchema,
  semantic: CapabilityStrengthSchema,
  humanReview: z.boolean(),
  notes: z.array(z.string()).default([]),
});

export const CoverageManifestSchema = z.object({
  schema: z.literal("art/coverage-manifest/v1"),
  generatedAt: z.string().datetime(),
  engine: z.object({
    name: z.string(),
    version: z.string(),
    configuration: z.string(),
  }),
  capabilities: z.array(RequirementCapabilitySchema),
  limitations: z.array(z.string()),
});

export type RequirementCapability = z.infer<typeof RequirementCapabilitySchema>;
export type CoverageManifest = z.infer<typeof CoverageManifestSchema>;

export const INITIAL_REQUIREMENT_CAPABILITIES: RequirementCapability[] = [
  {
    schema: "art/requirement-capability/v1",
    framework: "WCAG",
    criterion: "1.1.1",
    deterministic: "PARTIAL",
    behavioral: "NONE",
    semantic: "PARTIAL",
    humanReview: true,
    notes: ["Presence/structure is machine-testable; appropriateness of text alternatives can require semantic or human judgment."],
  },
  {
    schema: "art/requirement-capability/v1",
    framework: "WCAG",
    criterion: "2.4.3",
    deterministic: "PARTIAL",
    behavioral: "STRONG",
    semantic: "NONE",
    humanReview: true,
    notes: ["Tab/focus traces provide reproducible behavioral evidence but do not alone prove a meaningful focus order."],
  },
  {
    schema: "art/requirement-capability/v1",
    framework: "WCAG",
    criterion: "2.5.8",
    deterministic: "STRONG",
    behavioral: "PARTIAL",
    semantic: "NONE",
    humanReview: true,
    notes: ["axe-core target-size is useful evidence but remains disabled by default because of false-positive risk."],
  },
  {
    schema: "art/requirement-capability/v1",
    framework: "WCAG",
    criterion: "3.3.3",
    deterministic: "WEAK",
    behavioral: "PARTIAL",
    semantic: "STRONG",
    humanReview: true,
    notes: ["Error-suggestion quality is contextual; deterministic capture should precede any bounded semantic decision."],
  },
];

export function buildCoverageManifest(): CoverageManifest {
  return CoverageManifestSchema.parse({
    schema: "art/coverage-manifest/v1",
    generatedAt: new Date().toISOString(),
    engine: {
      name: "axe-core",
      version: "4.13.0",
      configuration: "default",
    },
    capabilities: INITIAL_REQUIREMENT_CAPABILITIES,
    limitations: [
      "Coverage is capability metadata, not a conformance percentage.",
      "Absence of a finding does not establish WCAG conformance.",
      "Human review remains required where the criterion depends on meaning, appropriateness, or complete user-task behavior.",
      "WCAG 2.2 axe rules disabled by default are not silently represented as tested.",
    ],
  });
}
