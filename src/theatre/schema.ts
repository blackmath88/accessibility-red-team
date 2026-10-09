// Shared by the CLI emitter and the Worker; keep free of Node imports.
import { z } from "zod";
import contract from "../../theatre/events.schema.json" with { type: "json" };

// The enum lists live in theatre/events.schema.json; the pipeline adapts to that contract.
const p = contract.properties;
export const contractDetailMax = p.detail.maxLength;
const oneOf = (values: string[]) => z.enum(values as [string, ...string[]]);

export const TheatreEventSchema = z.strictObject({
  ts: z.iso.datetime(),
  run: z.string().min(1),
  stage: oneOf(p.stage.enum),
  actor: oneOf(p.actor.enum),
  subject: z.strictObject({
    kind: oneOf(p.subject.properties.kind.enum),
    id: z.string().min(1),
    site: z.string().optional(),
  }),
  verdict: oneOf(p.verdict.enum),
  detail: z.string().max(p.detail.maxLength).optional(),
  cost: z.strictObject({
    ms: z.number().min(0).optional(),
    usd: z.number().min(0).optional(),
    tokens: z.number().int().min(0).optional(),
  }).optional(),
});

export type TheatreEvent = z.infer<typeof TheatreEventSchema>;
