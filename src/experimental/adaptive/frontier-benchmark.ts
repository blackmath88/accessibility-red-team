// Paired frontier benchmark: configuration and DRY RUN ONLY. Prints the plan for conditions A, hidden, B, C, D over fixtures x repeats and
// refuses to produce a confirm hash while any owner-supplied value is missing. There is no live path in this file: --live is refused.
// It reads no environment variables and makes no network call.
//   npm run adaptive:frontier-benchmark [-- --config <path>]
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { costOf } from "./budget.js";
import { ExplorationConditionSchema, LimitsSchema } from "./contracts.js";
import { codeSha } from "./executor.js";
import { confirmHashFor } from "./live-trial.js";
import { FRONTIER_DEV_FIXTURES, LEAKY_FIXTURES } from "../../../test/fixtures/adaptive-sites/variants.js";

// Each condition id is bound to its flags, selector and model slot, so a filled-in config cannot hash a mislabelled plan.
// "hidden" is the ledger-hidden control: it separates ledger visibility from the shared repairs (skill v4, report_candidate, completion).
const FLAGS = ["ledgerVisible", "completionAccounting", "incrementalCandidates"] as const;
export const EXPECTED_CONDITIONS = {
  A: { flags: [false, false, false], selector: "model", model: "baseline" },
  hidden: { flags: [false, true, true], selector: "model", model: "baseline" },
  B: { flags: [true, true, true], selector: "model", model: "baseline" },
  C: { flags: [true, true, true], selector: "model", model: "stronger" },
  D: { flags: [true, true, true], selector: "scheduler", model: null },
} as const;

export const DEFAULT_BENCHMARK_CONFIG = "src/experimental/adaptive/trials/frontier-benchmark.v1.json";
const PLACEHOLDER = /^OWNER_SUPPLIED/;

const PricingSchema = z.strictObject({
  currency: z.string().length(3), inputPerMillion: z.number().positive(), outputPerMillion: z.number().positive(),
  source: z.string().url(), checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const ModelSchema = z.strictObject({
  model: z.string().min(1).refine((model) => !PLACEHOLDER.test(model), "owner must supply an exact pinned model id").refine((model) => !/latest/i.test(model), "pin a dated model id, not an alias"),
  pricing: PricingSchema,
});

export const BenchmarkConfigSchema = z.strictObject({
  schema: z.literal("art/adaptive-frontier-benchmark-config/v1"),
  status: z.string(),
  provider: z.literal("mistral"),
  apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  baseUrl: z.string().url().refine((url) => new URL(url).protocol === "https:", "baseUrl must be https"),
  models: z.strictObject({ baseline: ModelSchema, stronger: ModelSchema }),
  conditions: z.array(z.strictObject({ id: z.enum(["A", "hidden", "B", "C", "D"]), label: z.string(), model: z.enum(["baseline", "stronger"]).nullable(), condition: ExplorationConditionSchema })).min(1),
  fixtures: z.array(z.enum(FRONTIER_DEV_FIXTURES)).min(1),
  fixtureSplit: z.literal("development"),
  // Fixtures whose URLs or link text reveal the defect; scored separately from neutral variants.
  leakyFixtures: z.array(z.string()),
  repeats: z.number().int().min(1).max(20),
  session: LimitsSchema.omit({ maxResponseBytes: true }),
  totalBudget: z.strictObject({ currency: z.string().length(3), maxSpend: z.number().positive() }),
  outRoot: z.string().min(1),
}).superRefine((config, ctx) => {
  const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  for (const [index, item] of config.conditions.entries()) {
    if ((item.condition.selector === "scheduler") !== (item.model === null)) fail(["conditions", index], "the scheduler condition has no model; every model condition names one");
    const expected = EXPECTED_CONDITIONS[item.id];
    const flags = FLAGS.map((flag) => item.condition[flag]);
    if (flags.some((value, at) => value !== expected.flags[at]) || item.condition.selector !== expected.selector) {
      fail(["conditions", index, "condition"], `condition ${item.id} must have ${FLAGS.map((flag, at) => `${flag}=${expected.flags[at]}`).join(", ")}, selector=${expected.selector}`);
    }
    if (item.model !== expected.model) fail(["conditions", index, "model"], `condition ${item.id} must use model slot ${expected.model ?? "null (no model)"}`);
  }
  const ids = config.conditions.map((item) => item.id);
  if (new Set(ids).size !== ids.length) fail(["conditions"], `condition ids must be unique: ${ids.join(", ")}`);
  if (config.models.stronger.model === config.models.baseline.model) fail(["models", "stronger", "model"], "the stronger model must differ from the baseline model");
  for (const fixture of config.fixtures) if (LEAKY_FIXTURES.includes(fixture) && !config.leakyFixtures.includes(fixture)) fail(["leakyFixtures"], `${fixture} reveals its defect in URLs or link text and must be listed as leaky`);
  for (const fixture of config.leakyFixtures) if (!(config.fixtures as string[]).includes(fixture)) fail(["leakyFixtures"], `${fixture} is not in fixtures`);
});
export type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>;

type Raw = Record<string, any>;
export type BenchmarkPlan = { lines: string[]; problems: string[]; confirmHash: string | null };

// Works on the raw JSON so that a plan can be shown even while placeholders remain; the hash needs the strict schema and the budget check.
export function benchmarkPlan(raw: Raw, sha: string): BenchmarkPlan {
  const problems: string[] = [];
  const parsed = BenchmarkConfigSchema.safeParse(raw);
  if (!parsed.success) for (const issue of parsed.error.issues) problems.push(`${issue.path.join(".") || "(config)"}: ${issue.message}`);
  const s = raw["session"] ?? {};
  const conditions: Raw[] = raw["conditions"] ?? [];
  const fixtures: string[] = raw["fixtures"] ?? [];
  const repeats = Number(raw["repeats"] ?? 0);
  const perCondition = fixtures.length * repeats;
  let worstTotal = 0;
  let priced = true;
  const rows = conditions.map((item) => {
    const model = item["model"] ? raw["models"]?.[item["model"]] : null;
    const pricing = model?.pricing;
    const known = !model || (typeof pricing?.inputPerMillion === "number" && typeof pricing?.outputPerMillion === "number");
    const worst = !model ? 0 : known ? costOf(pricing, perCondition * s.maxInputTokens, perCondition * s.maxOutputTokens) : null;
    if (worst === null) priced = false; else worstTotal += worst;
    return `  ${String(item["id"]).padEnd(7)} ${String(item["label"]).padEnd(66)} ${model ? model.model : "no model (scheduler)"}; ${perCondition} sessions, <= ${model ? perCondition * s.maxModelCalls : 0} model calls; worst-case spend ${worst === null ? "UNKNOWN (no price)" : `${worst.toFixed(4)} ${pricing?.currency ?? ""}`}`;
  });
  const budget = raw["totalBudget"]?.maxSpend;
  if (priced && typeof budget === "number" && worstTotal > budget) problems.push(`totalBudget.maxSpend: worst-case spend ${worstTotal.toFixed(4)} exceeds the budget ${budget}`);
  const confirmHash = problems.length ? null : confirmHashFor(parsed.success ? parsed.data : raw, sha);
  const lines = [
    "Frontier benchmark — DRY RUN PLAN (no network call, no environment read, no live path)",
    `  code                 ${sha}`,
    `  fixtures             ${fixtures.map((name) => (raw["leakyFixtures"] ?? []).includes(name) ? `${name} [LEAKY]` : name).join(", ")} (${raw["fixtureSplit"] ?? "?"}; none is held out)`,
    `  leaky fixtures       ${(raw["leakyFixtures"] ?? []).join(", ") || "none"}: URLs or link text reveal the defect; scored separately from the neutral variants`,
    `  repeats              ${repeats}  ->  ${perCondition} sessions per condition, ${perCondition * conditions.length} in total`,
    `  per session          ${s.maxModelCalls} model calls, ${s.maxSteps} steps, ${s.maxInputTokens} input / ${s.maxOutputTokens} output tokens, ${s.maxWallMs} ms, ${s.maxSurfaces} surfaces (same caps for every condition)`,
    "  conditions",
    ...rows,
    `  worst-case total     ${priced ? worstTotal.toFixed(4) : "UNKNOWN (unpriced model)"}; budget ${typeof budget === "number" ? budget : "NOT SUPPLIED"} ${raw["totalBudget"]?.currency ?? ""}`,
    "",
    ...(problems.length
      ? ["REFUSED: no confirm hash while these remain (owner must supply them):", ...problems.map((problem) => `  - ${problem}`)]
      : [`confirm hash ${confirmHash} (binds this config and code; a live runner still needs separate owner approval and does not exist yet)`]),
  ];
  return { lines, problems, confirmHash };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--live")) throw new Error("the frontier benchmark has no live path; it is a dry run only");
  const index = args.indexOf("--config");
  const raw = JSON.parse(await readFile(index >= 0 ? args[index + 1]! : DEFAULT_BENCHMARK_CONFIG, "utf8")) as Raw;
  const plan = benchmarkPlan(raw, codeSha());
  console.log(plan.lines.join("\n"));
  if (plan.problems.length) process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
