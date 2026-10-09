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
  at: z.strictObject({
    selector: z.string().min(1),
    snippet: z.string().max(p.at.properties.snippet.maxLength).regex(new RegExp(p.at.properties.snippet.pattern)).optional(),
  }).optional(),
  cost: z.strictObject({
    ms: z.number().min(0).optional(),
    usd: z.number().min(0).optional(),
    tokens: z.number().int().min(0).optional(),
  }).optional(),
}).refine((e) => !e.at || (contract.if.properties.stage.enum.includes(e.stage) && e.subject.kind === contract.if.properties.subject.properties.kind.const),
  { message: "at is only allowed on probe/triage observation events", path: ["at"] });

// Where an observation sits on the page: the axe node target and a text-only snippet of its html.
export function atOf(node: { target: string[]; html: string }) {
  const text = node.html.replace(/<[^>]*(>|$)/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, p.at.properties.snippet.maxLength);
  return { selector: node.target.join(" ") || "(document)", ...(text ? { snippet: text } : {}) };
}

export type TheatreEvent = z.infer<typeof TheatreEventSchema>;
