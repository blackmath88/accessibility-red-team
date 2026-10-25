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
    assert.ok(plan.lines.some((line) => /skip-links \[LEAKY\]/.test(line)), "leaky fixtures are flagged in the plan");
    assert.ok(plan.lines.some((line) => /^  hidden /.test(line)), "the ledger-hidden control is in the shipped plan");
    assert.ok(plan.lines.some((line) => /30 sessions per condition, 150 in total/.test(line)));
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
    filled.conditions.find((item: { id: string }) => item.id === "D").model = "baseline";
    assert.ok(benchmarkPlan(filled, "sha").problems.some((problem) => /scheduler condition has no model/.test(problem)));
  });

  it("refuses mislabelled conditions, duplicate ids, an unchanged stronger model and an unflagged leaky fixture (review M4, m1, m2)", async () => {
    const filled = async () => {
      const config = await shipped();
      config.models.stronger = { model: "example-large-2609", pricing: { currency: "USD", inputPerMillion: 2, outputPerMillion: 6, source: "https://example.org/prices", checkedOn: "2026-10-25" } };
      config.totalBudget.maxSpend = 20;
      return config;
    };
    const byId = (config: Record<string, any>, id: string) => config.conditions.find((item: { id: string }) => item.id === id);
    assert.deepEqual(benchmarkPlan(await filled(), "sha").problems, []);
    const cases: Array<[string, (config: Record<string, any>) => void, RegExp]> = [
      ["A with flags on", (config) => { Object.assign(byId(config, "A").condition, { ledgerVisible: true, completionAccounting: true }); }, /condition A must have/],
      ["hidden with the ledger visible", (config) => { byId(config, "hidden").condition.ledgerVisible = true; }, /condition hidden must have/],
      ["C on the baseline model", (config) => { byId(config, "C").model = "baseline"; }, /condition C must use model slot stronger/],
      ["B on the stronger model", (config) => { byId(config, "B").model = "stronger"; }, /condition B must use model slot baseline/],
      ["two entries with id A", (config) => { config.conditions.push(structuredClone(byId(config, "A"))); }, /ids must be unique/],
      ["stronger equals baseline", (config) => { config.models.stronger.model = config.models.baseline.model; }, /must differ from the baseline/],
      ["leaky fixture not flagged", (config) => { config.leakyFixtures = ["skip-links"]; }, /news-service reveals its defect/],
    ];
    for (const [name, mutate, expected] of cases) {
      const config = await filled();
      mutate(config);
      const plan = benchmarkPlan(config, "sha");
      assert.equal(plan.confirmHash, null, name);
      assert.ok(plan.problems.some((problem) => expected.test(problem)), `${name}: ${JSON.stringify(plan.problems)}`);
    }
  });
});
