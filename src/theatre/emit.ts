import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { TheatreEventSchema, type TheatreEvent, contractDetailMax } from "./schema.js";

export { TheatreEventSchema, type TheatreEvent };
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
      if (candidate.detail && candidate.detail.length > contractDetailMax) {
        candidate.detail = candidate.detail.slice(0, contractDetailMax - 1) + "…";
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
