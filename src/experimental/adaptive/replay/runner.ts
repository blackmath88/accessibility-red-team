import { z } from "zod";
import { ActionV4Schema } from "../contracts.js";
import { FakeProvider, type FakeScript } from "../providers/fake.js";
import { ReplayManifestSchema, type ReplayManifest } from "./manifest.js";
import { packetHash, packetMessages } from "./packets.js";

export const ReplayAnswerSchema = z.strictObject({
  action: ActionV4Schema,
  interpretation: z.string().min(1), rationale: z.string().optional(),
});
export type ReplayAnswer = z.infer<typeof ReplayAnswerSchema>;
export type RequestKind = "primary" | "retry" | "finish_rejection_continuation";
export type ReplayAttempt = { requestId: string; kind: RequestKind };
const ExtraAttemptSchema = z.strictObject({ requestId: z.string(), kind: z.enum(["retry", "finish_rejection_continuation"]) });
export type ExtraAttempt = z.infer<typeof ExtraAttemptSchema>;
export type ReplayRecord = {
  requestId: string; kind: RequestKind; packetSha256: string; modelSlot: "current" | "stronger"; actualModel: string;
  status: "answered" | "malformed" | "provider_error";
  answer: Omit<ReplayAnswer, "rationale"> | null;
};

// Scripted mechanism check, not a model-quality result. No evaluator key, credentials, network, or browser tools.
export const smokeScript: FakeScript = ({ request }) => {
  const packet = JSON.parse(request.messages[1]!.content) as { point: string };
  return { raw: JSON.stringify(packet.point === "missed_sibling"
    ? { action: { type: "navigate", url: "/s/b.html" }, interpretation: "sibling_unobserved" }
    : { action: { type: "capture_evidence", targetRef: "e2" }, interpretation: "focus_return_not_observed" }) };
};

export async function runFakeReplay(input: ReplayManifest, provider = new FakeProvider(smokeScript), extras: ExtraAttempt[] = []) {
  if (!(provider instanceof FakeProvider)) throw new Error("replay smoke requires FakeProvider");
  const manifest = ReplayManifestSchema.parse(input);
  const extraAttempts = z.array(ExtraAttemptSchema).parse(extras);
  // Additional attempts are explicit; no malformed response or finish ever silently creates another request.
  const attempts: ReplayAttempt[] = [...manifest.requests.map((request) => ({ requestId: request.id, kind: "primary" as const })), ...extraAttempts];
  const byId = new Map(manifest.requests.map((request) => [request.id, request]));
  for (const attempt of attempts) if (!byId.has(attempt.requestId)) throw new Error(`unknown replay request: ${attempt.requestId}`);
  const counters = { totalRequests: 0, primaryRequests: 0, retries: 0, finishRejectionContinuations: 0, malformedResponses: 0, providerErrors: 0 };
  const records: ReplayRecord[] = [];
  for (const attempt of attempts) {
    const cell = byId.get(attempt.requestId)!;
    const messages = packetMessages(cell.point, cell.variant);
    counters.totalRequests += 1;
    if (attempt.kind === "primary") counters.primaryRequests += 1;
    else if (attempt.kind === "retry") counters.retries += 1;
    else counters.finishRejectionContinuations += 1;
    const record: ReplayRecord = { ...attempt, packetSha256: packetHash(messages), modelSlot: cell.modelSlot, actualModel: provider.requestedModel, status: "provider_error", answer: null };
    let text: string;
    try { text = (await provider.complete({ messages, ...manifest.sampling })).text; }
    catch { counters.providerErrors += 1; records.push(record); continue; }
    try {
      const { rationale: _rationale, ...answer } = ReplayAnswerSchema.parse(JSON.parse(text));
      record.answer = answer;
      record.status = "answered";
    } catch { counters.malformedResponses += 1; record.status = "malformed"; }
    records.push(record);
  }
  return { provenance: manifest.provenance, counters, records };
}
