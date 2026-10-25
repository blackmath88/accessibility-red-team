import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { DEFAULT_BENCHMARK_CONFIG, benchmarkPlan } from "../src/experimental/adaptive/frontier-benchmark.js";

const shipped = async () => JSON.parse(await readFile(DEFAULT_BENCHMARK_CONFIG, "utf8")) as Record<string, any>;

describe("frontier benchmark config (dry run only)", () => {
  it("the shipped config prints a plan but refuses a confirm hash while owner placeholders remain", async () => {
    const plan = benchmarkPlan(await shipped(), "sha");
    assert.equal(plan.confirmHash, null);
    assert.ok(plan.problems.some((problem) => problem.startsWith("models.stronger.model: owner must supply")));
    assert.ok(plan.problems.some((problem) => problem.startsWith("totalBudget.maxSpend")));
    assert.ok(plan.lines.some((line) => line.startsWith("REFUSED")));
    assert.ok(plan.lines.some((line) => /30 sessions per condition, 120 in total/.test(line)));
  });

  it("a filled-in config yields a hash bound to config and code; aliases and over-budget plans are refused", async () => {
    const filled = await shipped();
    filled.models.stronger = { model: "example-large-2609", pricing: { currency: "USD", inputPerMillion: 2, outputPerMillion: 6, source: "https://example.org/prices", checkedOn: "2026-10-25" } };
    filled.totalBudget.maxSpend = 20;
    const plan = benchmarkPlan(filled, "sha");
    assert.deepEqual(plan.problems, []);
    assert.match(plan.confirmHash ?? "", /^[a-f0-9]{16}$/);
    assert.notEqual(benchmarkPlan(filled, "other").confirmHash, plan.confirmHash);
    assert.equal(benchmarkPlan({ ...filled, models: { ...filled.models, stronger: { ...filled.models.stronger, model: "large-latest" } } }, "sha").confirmHash, null);
    assert.ok(benchmarkPlan({ ...filled, totalBudget: { currency: "USD", maxSpend: 0.5 } }, "sha").problems.some((problem) => /exceeds the budget/.test(problem)));
  });

  it("the scheduler condition has no model and every model condition names one", async () => {
    const filled = await shipped();
    filled.models.stronger = { model: "example-large-2609", pricing: { currency: "USD", inputPerMillion: 2, outputPerMillion: 6, source: "https://example.org/prices", checkedOn: "2026-10-25" } };
    filled.totalBudget.maxSpend = 20;
    filled.conditions[3].model = "baseline";
    assert.ok(benchmarkPlan(filled, "sha").problems.some((problem) => /scheduler condition has no model/.test(problem)));
  });
});
