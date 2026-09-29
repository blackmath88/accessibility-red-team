import { z } from "zod";
import { OrganizationTypeSchema } from "../control-center/contracts.js";

export const OnboardingBundleSchema = z.object({
  schema: z.literal("art/onboarding-bundle/v1"),
  organization: z.object({
    externalIds: z.record(z.string(), z.string()).default({}),
    type: OrganizationTypeSchema,
    name: z.string().min(1),
    jurisdiction: z.object({
      country: z.string().min(2),
      canton: z.string().nullable().optional(),
    }),
  }),
  properties: z.array(z.object({
    kind: z.enum(["website", "portal", "application", "other"]),
    url: z.string().url(),
    label: z.string().optional(),
    active: z.boolean().default(true),
  })).min(1),
  assessment: z.object({
    profileId: z.string().nullable().default(null),
    requestedArms: z.array(z.enum(["baseline_axe", "deterministic", "morrow"])).default(["baseline_axe", "deterministic"]),
    notes: z.string().default(""),
  }),
  contacts: z.array(z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    role: z.string().optional(),
    source: z.string(),
  })).default([]),
  provenance: z.object({
    preparedBy: z.string(),
    preparedAt: z.string().datetime(),
    sourceNotes: z.array(z.string()).default([]),
  }),
});

export type OnboardingBundle = z.infer<typeof OnboardingBundleSchema>;

export function onboardingPreview(bundle: OnboardingBundle) {
  const parsed = OnboardingBundleSchema.parse(bundle);
  return {
    organization: `${parsed.organization.name} (${parsed.organization.type})`,
    jurisdiction: [parsed.organization.jurisdiction.canton, parsed.organization.jurisdiction.country].filter(Boolean).join(", "),
    properties: parsed.properties.map((p) => p.url),
    arms: parsed.assessment.requestedArms,
    contacts: parsed.contacts.length,
    readyForApproval: true,
  };
}
