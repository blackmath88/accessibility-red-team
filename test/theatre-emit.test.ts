import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import contract from "../theatre/events.schema.json" with { type: "json" };
import { createEmitter, jsonlFile, TheatreEventSchema, type EmitInput } from "../src/theatre/emit.js";

const probe = (id: string): EmitInput => ({
  stage: "probe", actor: "code", subject: { kind: "observation", id, site: "s" }, verdict: "violation",
});

test("jsonlFile sink creates directories and appends valid lines in order", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "theatre-")), "nested", "events.jsonl");
  const emit = createEmitter({ run: "r1", sink: jsonlFile(path) });
  emit(probe("a"));
  emit({ ...probe("b"), detail: "axe.region · 2 nodes", cost: { ms: 12 } });
  emit(probe("c"));
  const lines = (await readFile(path, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((e) => e.subject.id), ["a", "b", "c"]);
  for (const line of lines) {
    assert.equal(line.run, "r1");
    TheatreEventSchema.parse(line);
  }
});

test("invalid events are skipped, never thrown", () => {
  const out: string[] = [];
  const emit = createEmitter({ run: "r", sink: (l) => out.push(l) });
  const warn = console.warn;
  console.warn = () => {};
  try {
    emit({ ...probe("x"), verdict: "maybe" });
    emit({ ...probe("y"), subject: { kind: "observation", id: "" } });
    emit(probe("ok"));
  } finally {
    console.warn = warn;
  }
  assert.equal(out.length, 1);
  assert.equal(JSON.parse(out[0]!).subject.id, "ok");
});

test("a throwing sink does not propagate into the pipeline", () => {
  const emit = createEmitter({ run: "r", sink: () => { throw new Error("disk full"); } });
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.doesNotThrow(() => emit(probe("a")));
  } finally {
    console.warn = warn;
  }
});

test("long detail is truncated to the contract maxLength", () => {
  const out: string[] = [];
  createEmitter({ run: "r", sink: (l) => out.push(l) })({ ...probe("a"), detail: "x".repeat(500) });
  assert.equal(JSON.parse(out[0]!).detail.length, contract.properties.detail.maxLength);
});

test("zod schema accepts every verdict listed in the JSON contract", () => {
  for (const verdict of contract.properties.verdict.enum) {
    TheatreEventSchema.parse({ ts: new Date().toISOString(), run: "r", stage: "run", actor: "code", subject: { kind: "run", id: "r" }, verdict });
  }
});

test("events are stamped when emitted, not when a buffering sink flushes", async () => {
  const buffered: string[] = [];
  const emit = createEmitter({ run: "r", sink: (l) => buffered.push(l) });
  emit(probe("a"));
  await new Promise((r) => setTimeout(r, 25));
  emit(probe("b"));
  await new Promise((r) => setTimeout(r, 25));
  const [a, b] = buffered.map((l) => Date.parse(JSON.parse(l).ts));
  assert.ok(b! - a! >= 20, `expected ≥20 ms between stamps, got ${b! - a!}`);
  assert.ok(Date.now() - b! >= 20, "b must not be stamped at flush time");
});
