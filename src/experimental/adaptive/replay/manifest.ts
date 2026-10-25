import { z } from "zod";
import { POINTS, VARIANTS, PointSchema, VariantSchema, packetHash, packetMessages } from "./packets.js";

const SlotSchema = z.discriminatedUnion("status", [
  z.strictObject({ id: z.enum(["current", "stronger"]), status: z.literal("configured"), exactModel: z.string().min(1).refine((model) => !/latest|placeholder|owner_supplied/i.test(model), "exact model required"), source: z.string().min(1) }),
  z.strictObject({ id: z.enum(["current", "stronger"]), status: z.literal("unresolved"), exactModel: z.null(), source: z.null() }),
]);
export const ReplayManifestSchema = z.strictObject({
  schema: z.literal("art/decision-replay/v1"),
  provenance: z.literal("synthetic_local_smoke"),
  historicalExtraction: z.strictObject({ status: z.literal("blocked"), reason: z.string().min(1) }),
  sourceCodeSha: z.string().regex(/^[a-f0-9]{40}$/),
  packetVersion: z.literal("synthetic-decisions/v1"),
  provider: z.literal("fake"),
  sampling: z.strictObject({ temperature: z.literal(0), maxOutputTokens: z.literal(600), responseFormat: z.literal("json_object"), timeoutMs: z.literal(1000) }),
  modelSlots: z.array(SlotSchema).length(2),
  repetitions: z.literal(10),
  requests: z.array(z.strictObject({
    id: z.string().min(1), point: PointSchema, variant: VariantSchema, modelSlot: z.enum(["current", "stronger"]),
    repetition: z.number().int().min(1).max(10), packetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })).length(120),
}).superRefine((manifest, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (new Set(manifest.modelSlots.map((slot) => slot.id)).size !== 2) fail("model slots must be distinct");
  if (new Set(manifest.requests.map((request) => request.id)).size !== 120) fail("request IDs must be distinct");
  const cells = new Set<string>();
  for (const request of manifest.requests) {
    const key = `${request.point}/${request.variant}/${request.modelSlot}/${request.repetition}`;
    if (cells.has(key)) fail(`duplicate matrix cell: ${key}`);
    cells.add(key);
    if (packetHash(packetMessages(request.point, request.variant)) !== request.packetSha256) fail(`packet hash mismatch: ${request.id}`);
  }
});
export type ReplayManifest = z.infer<typeof ReplayManifestSchema>;

export function makeManifest(): ReplayManifest {
  const modelSlots = ["current", "stronger"] as const;
  return ReplayManifestSchema.parse({
    schema: "art/decision-replay/v1", provenance: "synthetic_local_smoke",
    historicalExtraction: { status: "blocked", reason: "Exact trial-3 model-visible messages are absent on this host; narrative summaries are not replay inputs." },
    sourceCodeSha: "3065bc2fe655c325b360c20b2480fbfb0fd77722", packetVersion: "synthetic-decisions/v1", provider: "fake",
    sampling: { temperature: 0, maxOutputTokens: 600, responseFormat: "json_object", timeoutMs: 1000 },
    modelSlots: [
      { id: "current", status: "configured", exactModel: "mistral-small-2603", source: "src/experimental/adaptive/trials/frontier-benchmark.v1.json" },
      { id: "stronger", status: "unresolved", exactModel: null, source: null },
    ], repetitions: 10,
    requests: POINTS.flatMap((point) => VARIANTS.flatMap((variant) => modelSlots.flatMap((modelSlot) => Array.from({ length: 10 }, (_, index) => ({
      id: `${point}/${variant}/${modelSlot}/${index + 1}`, point, variant, modelSlot, repetition: index + 1, packetSha256: packetHash(packetMessages(point, variant)),
    }))))),
  });
}
