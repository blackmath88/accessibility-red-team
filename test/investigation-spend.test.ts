import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { ownerSpend } from "../src/experimental/investigation/spend.js";

describe("investigation owner-cap accounting fails closed", () => {
  let dir: string, prior: string, runs: string;
  const cwd = process.cwd();
  const env = (extra: Record<string, string> = {}) => ({ AIL_PRIOR_LEDGERS: prior, AIL_MIN_PRIOR_USD: "0.03", ...extra });
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "ail-spend-"));
    prior = join(dir, "prior"); runs = join(dir, "runs");
    await mkdir(join(prior, "s1"), { recursive: true }); await mkdir(join(prior, "repro"), { recursive: true }); // repro: no ledger (optional)
    await writeFile(join(prior, "s1", "ledger.json"), JSON.stringify({ consultant: { spend: 0.01 }, direct: { spend: 0.02 } }));
    await mkdir(join(runs, "m1"), { recursive: true });
    await writeFile(join(runs, "m1", "designer-ledger-a1.json"), JSON.stringify({ spend: 0.005 }));
  });
  after(async () => { process.chdir(cwd); await rm(dir, { recursive: true, force: true }); });

  it("sums the same ledgers from another working directory", async () => {
    process.chdir(tmpdir());
    try {
      const r = await ownerSpend(env(), [runs]);
      assert.equal(Math.round(r.total * 1e6), 35_000);
      assert.equal(r.parts.length, 2);
    } finally { process.chdir(cwd); }
  });

  it("refuses without the prior directory, the declared floor, or when the sum falls below the floor", async () => {
    await assert.rejects(ownerSpend({ AIL_MIN_PRIOR_USD: "0" }, [runs]), /AIL_PRIOR_LEDGERS not set/);
    await assert.rejects(ownerSpend({ AIL_PRIOR_LEDGERS: prior }, [runs]), /AIL_MIN_PRIOR_USD/);
    await assert.rejects(ownerSpend(env({ AIL_MIN_PRIOR_USD: "0.09" }), [runs]), /ledgers are missing/);
    await assert.rejects(ownerSpend(env({ AIL_EXTRA_RUN_ROOTS: join(dir, "nope") }), [runs]), /not a directory/);
  });

  it("rejects malformed, negative, non-finite and unreadable ledgers instead of skipping them", async () => {
    const bad = async (content: string, re: RegExp, mode?: number) => {
      const p = join(runs, "m1", "designer-ledger-bad.json");
      await writeFile(p, content); if (mode !== undefined) await chmod(p, mode);
      try { await assert.rejects(ownerSpend(env(), [runs]), re); } finally { await rm(p, { force: true }); }
    };
    await bad("{not json", /not valid JSON/);
    await bad(JSON.stringify({ spend: -1 }), /finite non-negative/);
    await bad('{"spend": "0.1"}', /finite non-negative/);
    await bad(JSON.stringify({ reservation: true }), /finite non-negative/);
    if (process.getuid?.() !== 0) await bad(JSON.stringify({ spend: 0.1 }), /unreadable/, 0o000);
    const p = join(prior, "s1", "ledger.json");
    await writeFile(p, JSON.stringify({ consultant: { spend: Number.MAX_VALUE * 10 } }).replace("null", "1e999"));
    await assert.rejects(ownerSpend(env(), [runs]), /finite non-negative|missing consultant/);
    await writeFile(p, JSON.stringify({ consultant: { spend: 0.01 }, direct: { spend: 0.02 } }));
  });
});
