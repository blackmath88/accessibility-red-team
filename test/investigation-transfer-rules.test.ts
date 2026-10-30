import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CONCLUSION_FILE, NAME, SUFFIX, concludeLedgerName, conclusionFileName, normalise, withRunLock } from "../src/experimental/investigation/transfer-rules.js";

describe("blind transfer naming and freeze rules", () => {
  it("every accepted conclusion suffix produces a file the freeze and reveal rules recognise", () => {
    for (const s of ["", "2", "3", "abc9"]) assert.ok(CONCLUSION_FILE.test(conclusionFileName(s)), s);
    for (const s of ["a-b", "../x", "A", ""]) if (s) assert.equal(SUFFIX.test(s), false, s);
  });
  it("conclude ledgers cannot collide with design ledgers", () => {
    assert.equal(NAME.test("a1.conclude"), false);
    assert.notEqual(concludeLedgerName("a1", ""), "a1-conclude");
    assert.equal(NAME.test("a1-conclude"), true); // a legal attempt name, now distinct from the conclude ledger name
  });
  it("duplicate normalisation ignores comment lines and spacing but keeps string contents", () => {
    assert.equal(normalise("// note\nconst a = 1;\n\n  /* block */\nconst  b = 2;"), normalise("const a = 1;\nconst b = 2;"));
    assert.notEqual(normalise('const u = "http://x/a";'), normalise('const u = "http://x/b";'));
    assert.notEqual(normalise("const r = /a\\/\\/b/;"), normalise("const r = /a\\/\\/c/;"));
  });
  it("a reveal cannot run while a conclusion is in flight, and the lock is released on success and failure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ail-lock-"));
    try {
      let finish!: () => void, started!: () => void;
      const holding = new Promise<void>((r) => { started = r; });
      const inFlight = withRunLock(dir, "conclude", () => new Promise<void>((r) => { finish = r; started(); }));
      await holding;
      await assert.rejects(withRunLock(dir, "reveal", async () => "revealed"), /locked by another conclude or reveal.*refusing reveal/);
      finish();
      await inFlight;
      assert.equal(await withRunLock(dir, "reveal", async () => "revealed"), "revealed");
      await assert.rejects(withRunLock(dir, "conclude", async () => { throw new Error("schema"); }), /schema/);
      await assert.rejects(access(join(dir, "run.lock")));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
