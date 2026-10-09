import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import contract from "../../theatre/events.schema.json" with { type: "json" };

// The enum lists live in theatre/events.schema.json; the pipeline adapts to that contract.
const p = contract.properties;
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
export type EmitInput = Omit<TheatreEvent, "ts" | "run"> & { ts?: string };
export type Emit = (event: EmitInput) => void;
export type Sink = (line: string) => void;

export const noopEmit: Emit = () => {};

export function jsonlFile(path: string): Sink {
  mkdirSync(dirname(path), { recursive: true });
  return (line) => appendFileSync(path, line + "\n");
}

export const stdout: Sink = (line) => { process.stdout.write(line + "\n"); };
export const noop: Sink = () => {};

export function createEmitter(options: { run: string; sink: Sink }): Emit {
  return (input) => {
    try {
      const candidate = { ts: new Date().toISOString(), run: options.run, ...input };
      if (candidate.detail && candidate.detail.length > p.detail.maxLength) {
        candidate.detail = candidate.detail.slice(0, p.detail.maxLength - 1) + "…";
      }
      const parsed = TheatreEventSchema.safeParse(candidate);
      if (!parsed.success) {
        console.warn(`theatre: skipped invalid event (${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message})`);
        return;
      }
      options.sink(JSON.stringify(parsed.data));
    } catch (error) {
      console.warn(`theatre: emit failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
