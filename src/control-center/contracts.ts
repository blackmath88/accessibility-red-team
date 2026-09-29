import { z } from "zod";

export const OrganizationTypeSchema = z.enum([
  "municipality", "canton", "public_agency", "company", "university", "nonprofit", "other",
]);
export const CaseStateSchema = z.enum([
  "DISCOVERED", "READY", "QUEUED", "SCANNING", "REVIEW", "REPORT_READY",
  "OUTREACH_READY", "CONTACTED", "WAITING", "RESCAN_DUE", "IMPROVED", "ARCHIVED",
]);
export const RunKindSchema = z.enum(["scan", "journeys", "assessment"]);
export const RunStateSchema = z.enum(["queued", "running", "succeeded", "partial", "failed", "cancelled"]);
export const ExecutionProviderSchema = z.enum(["nebuchadnezzar_worker", "github_actions"]);
export const RunStageSchema = z.enum([
  "queued", "claimed", "scout", "probes", "journeys", "semantic", "uploading", "finalizing", "completed",
]);
export const ExecutionPolicySchema = z.object({
  perHostConcurrency: z.number().int().min(1).max(2).default(1),
  delayMs: z.number().int().min(1000).max(60_000).default(5000),
  maxRetries: z.number().int().min(0).max(5).default(3),
  baseBackoffMs: z.number().int().min(500).max(30_000).default(2000),
  maxBackoffMs: z.number().int().min(1000).max(300_000).default(60_000),
});
export const ArtifactKindSchema = z.enum([
  "manifest", "coverage", "probe_results", "journey_results", "field_summary",
  "report_json", "report_html", "screenshot", "log",
]);

export const OrganizationSchema = z.object({
  schema: z.literal("art/control-center-organization/v1"),
  id: z.string().min(1),
  type: OrganizationTypeSchema,
  name: z.string().min(1),
  jurisdiction: z.object({ country: z.string().min(2), canton: z.string().nullable().optional() }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DigitalPropertySchema = z.object({
  schema: z.literal("art/control-center-property/v1"),
  id: z.string().min(1),
  organizationId: z.string().min(1),
  kind: z.enum(["website", "portal", "application", "other"]),
  url: z.string().url(),
  active: z.boolean(),
});

export const AssessmentCaseSchema = z.object({
  schema: z.literal("art/control-center-case/v1"),
  id: z.string().min(1),
  organizationId: z.string().min(1),
  propertyId: z.string().min(1),
  kind: z.literal("accessibility_assessment"),
  state: CaseStateSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const RunSchema = z.object({
  schema: z.literal("art/control-center-run/v1"),
  id: z.string().min(1),
  caseId: z.string().min(1),
  propertyId: z.string().min(1),
  kind: RunKindSchema,
  state: RunStateSchema,
  idempotencyKey: z.string().min(1),
  requestedBy: z.string().min(1),
  requestedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  engineRevision: z.string().min(1),
  executionProvider: ExecutionProviderSchema.default("nebuchadnezzar_worker"),
  stage: RunStageSchema.default("queued"),
  executionPolicy: ExecutionPolicySchema.default({
    perHostConcurrency: 1, delayMs: 5000, maxRetries: 3, baseBackoffMs: 2000, maxBackoffMs: 60_000,
  }),
  workerId: z.string().nullable().default(null),
  leaseExpiresAt: z.string().datetime().nullable().default(null),
  heartbeatAt: z.string().datetime().nullable().default(null),
  attempt: z.number().int().nonnegative().default(0),
  progress: z.record(z.string(), z.unknown()).default({}),
  error: z.string().nullable(),
});

export const ArtifactSchema = z.object({
  schema: z.literal("art/control-center-artifact/v1"),
  id: z.string().min(1),
  runId: z.string().min(1),
  kind: ArtifactKindSchema,
  contentType: z.string().min(1),
  storageKey: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const AuditEventSchema = z.object({
  schema: z.literal("art/control-center-audit-event/v1"),
  id: z.string().min(1),
  actor: z.string().min(1),
  action: z.string().min(1),
  objectType: z.enum(["organization", "property", "case", "run", "artifact", "outreach"]),
  objectId: z.string().min(1),
  occurredAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type Run = z.infer<typeof RunSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type ExecutionProvider = z.infer<typeof ExecutionProviderSchema>;
export type ExecutionPolicy = z.infer<typeof ExecutionPolicySchema>;
