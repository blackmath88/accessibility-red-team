import { z } from "zod";

export const SurfaceKindSchema = z.enum([
  "home",
  "service",
  "article",
  "directory",
  "form",
  "search",
  "document",
  "external_handoff",
  "special_app",
  "unknown",
]);

export const DiscoveredPageSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  kind: SurfaceKindSchema,
  reason: z.string(),
  depth: z.number().int().nonnegative(),
  structuralFingerprint: z.string(),
  hasForm: z.boolean(),
  pdfLinks: z.number().int().nonnegative(),
  internalLinks: z.number().int().nonnegative(),
});

export const AccessibilitySurfaceSchema = z.object({
  schema: z.literal("art/accessibility-surface/v1"),
  entrypoint: z.string().url(),
  finalEntrypoint: z.string().url(),
  discoveredAt: z.string().datetime(),
  strategy: z.object({
    mode: z.enum(["broad", "targeted"]),
    maxPages: z.number().int().positive(),
    maxDepth: z.number().int().nonnegative(),
    reason: z.string(),
  }),
  discoveredPages: z.number().int().nonnegative(),
  surfaces: z.array(
    DiscoveredPageSchema.extend({
      surfaceId: z.string(),
      selectionReason: z.string(),
    }),
  ),
});

export type SurfaceKind = z.infer<typeof SurfaceKindSchema>;
export type DiscoveredPage = z.infer<typeof DiscoveredPageSchema>;
export type AccessibilitySurface = z.infer<typeof AccessibilitySurfaceSchema>;
