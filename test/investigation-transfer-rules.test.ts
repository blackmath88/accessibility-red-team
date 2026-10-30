import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONCLUSION_FILE, NAME, SUFFIX, concludeLedgerName, conclusionFileName, normalise } from "../src/experimental/investigation/transfer-rules.js";

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
});
