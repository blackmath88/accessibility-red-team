// Experimental adaptive-assessment track (docs/experiments/ADAPTIVE_MISTRAL.md). Not imported by production code.
// Fixture-only trial of arm B with a REAL model (Mistral), next to a scripted reference run, under hard trial-wide budgets.
//   npm run adaptive:mistral-fixture-trial                      dry run: validates the config, prints the plan, makes NO network call
//   npm run adaptive:mistral-fixture-trial -- --live --confirm <hash>   real run of exactly the configuration the dry run printed
// Only loopback fixtures are browsed (the browser sits behind the containment proxy). The only outbound traffic is the model API.
// The API key is read from the environment variable the config names; it is never printed, logged or written.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { BudgetedProvider, costOf, worstCaseSpend, type BudgetLedger } from "./budget.js";
import { runTrial, type TrialResult } from "./cli.js";
import type { FixtureComparison } from "./compare.js";
import { LimitsSchema } from "./contracts.js";
import { codeSha } from "./executor.js";
import { ProviderError, type ModelProvider } from "./provider.js";
import { MistralProvider, modelIdentityMatches } from "./providers/mistral.js";
import { FIXTURE_NAMES, type FixtureName } from "../../../test/fixtures/adaptive-sites/server.js";

export const DEFAULT_CONFIG_PATH = "src/experimental/adaptive/trials/mistral-fixture-trial.v1.json";
const PREFLIGHT_OUTPUT_TOKENS = 16;

export const LiveTrialConfigSchema = z.strictObject({
  schema: z.literal("art/adaptive-live-trial-config/v1"),
  provider: z.literal("mistral"),
  model: z.string().min(1).refine((model) => !/latest/i.test(model), "pin a dated model id, not an alias"),
  apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  baseUrl: z.string().url().refine((url) => new URL(url).protocol === "https:", "baseUrl must be https"),
  pricing: z.strictObject({ currency: z.string().length(3), inputPerMillion: z.number().positive(), outputPerMillion: z.number().positive(), source: z.string().url(), checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  fixtures: z.array(z.enum(FIXTURE_NAMES)).min(1),
  session: LimitsSchema.omit({ maxResponseBytes: true }),
  trial: z.strictObject({
    maxCalls: z.number().int().positive().max(500),
    maxInputTokens: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
    maxSpend: z.number().positive().max(20),
    maxWallMs: z.number().int().positive().max(3_600_000),
    minCallIntervalMs: z.number().int().min(0),
  }),
  preflight: z.boolean(),
  outRoot: z.string().min(1),
}).superRefine((config, ctx) => {
  if (worstCaseSpend(config.pricing, config.trial) > config.trial.maxSpend) {
    ctx.addIssue({ code: "custom", path: ["trial"], message: `planned max spend ${worstCaseSpend(config.pricing, config.trial).toFixed(4)} ${config.pricing.currency} exceeds maxSpend ${config.trial.maxSpend}; lower the token caps or raise the cap deliberately` });
  }
});
export type LiveTrialConfig = z.infer<typeof LiveTrialConfigSchema>;

export type Plan = { config: LiveTrialConfig; codeSha: string; confirmHash: string; worstCaseSpend: number; keyPresent: boolean; lines: string[] };

const canonical = (value: unknown): string => JSON.stringify(value, (_key, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : v));

// The hash binds a live run to the exact configuration and code that the dry run showed.
export function confirmHashOf(config: LiveTrialConfig, sha: string): string {
  return confirmHashFor(config, sha);
}

// The same binding for any validated configuration (used by the frontier benchmark dry run).
export function confirmHashFor(config: unknown, sha: string): string {
  return createHash("sha256").update(`${canonical(config)}\n${sha}`).digest("hex").slice(0, 16);
}

export function plan(config: LiveTrialConfig, env: Record<string, string | undefined>, sha: string): Plan {
  const worst = worstCaseSpend(config.pricing, config.trial);
  const keyPresent = Boolean(env[config.apiKeyEnv]);
  const confirmHash = confirmHashOf(config, sha);
  const s = config.session;
  const t = config.trial;
  const p = config.pricing;
  const lines = [
    "Mistral fixture trial — PLAN (no network call has been made)",
    `  code                 ${sha}`,
    `  provider / model     ${config.provider} / ${config.model} (pinned; returned model id must match)`,
    `  endpoint             ${config.baseUrl}/v1/chat/completions (json_object, temperature 0, no retries)`,
    `  key                  env ${config.apiKeyEnv}: ${keyPresent ? "set (value not shown)" : "NOT SET"}`,
    `  pricing              ${p.inputPerMillion} / ${p.outputPerMillion} ${p.currency} per 1M input / output tokens (from ${p.source}, checked ${p.checkedOn})`,
    `  fixtures             ${config.fixtures.join(", ")} (loopback only, behind the containment proxy)`,
    `  per session          ${s.maxModelCalls} model calls, ${s.maxSteps} steps, ${s.maxInputTokens} input / ${s.maxOutputTokens} output tokens, ${s.maxWallMs} ms, ${s.maxSurfaces} surfaces`,
    `  whole trial (hard)   ${t.maxCalls} calls, ${t.maxInputTokens} input / ${t.maxOutputTokens} output tokens, ${t.maxWallMs} ms, ${t.maxSpend} ${p.currency} spend cap, >= ${t.minCallIntervalMs} ms between calls`,
    `  planned max spend    ${worst.toFixed(4)} ${p.currency} = token caps x configured prices (input is reserved as an estimate, so the final call can overshoot slightly; the ${t.maxSpend} ${p.currency} cap stops further calls)`,
    `  preflight            ${config.preflight ? `yes: 1 call, ${PREFLIGHT_OUTPUT_TOKENS} output tokens, checks json_object and the returned model id; trial aborts if either fails` : "no"}`,
    `  data sent            fixture page text, DOM summaries and the skill prompt go to ${new URL(config.baseUrl).host} (third party); no screenshots`,
    `  outputs              ${config.outRoot}/<id>/real-model (model results), ${config.outRoot}/<id>/scripted-reference (scripted, no model, same arm B limits), report.md, ledger.json`,
    "",
    keyPresent ? `To run exactly this: npm run adaptive:mistral-fixture-trial -- --live --confirm ${confirmHash}` : `Set ${config.apiKeyEnv} first (see docs/experiments/ADAPTIVE_MISTRAL.md); the confirm hash is ${confirmHash}.`,
  ];
  return { config, codeSha: sha, confirmHash, worstCaseSpend: worst, keyPresent, lines };
}

export async function loadConfig(path: string): Promise<LiveTrialConfig> {
  return LiveTrialConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export type LiveRunOptions = {
  config: LiveTrialConfig;
  confirm: string;
  id?: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  codeSha?: string;
};

export type LiveRunResult = { dir: string; ledger: BudgetLedger; preflight: Record<string, unknown> | null; real: TrialResult | null; scripted: TrialResult; aborted: string | null };

export async function runLive(options: LiveRunOptions): Promise<LiveRunResult> {
  const { config } = options;
  const env = options.env ?? process.env;
  const sha = options.codeSha ?? codeSha();
  const expected = confirmHashOf(config, sha);
  if (options.confirm !== expected) throw new Error(`--confirm does not match this configuration and code (expected the hash printed by the dry run); refusing to call the model`);
  if (!env[config.apiKeyEnv]) throw new Error(`environment variable ${config.apiKeyEnv} is not set`);

  const id = options.id ?? new Date().toISOString().replace(/[:.]/g, "-");
  const dir = resolve(config.outRoot, id);
  await mkdir(dir, { recursive: true });
  const mistral = new MistralProvider({ apiKeyEnv: config.apiKeyEnv, model: config.model, baseUrl: config.baseUrl, env, ...(options.fetch ? { fetch: options.fetch } : {}) });
  // Both runs get the same arm B limits, so a difference between them is not a difference in budget.
  const armBLimits = { limits: { maxSurfaces: config.session.maxSurfaces, maxWallMs: config.session.maxWallMs }, sessionLimits: { maxSteps: config.session.maxSteps, maxModelCalls: config.session.maxModelCalls, maxInputTokens: config.session.maxInputTokens, maxOutputTokens: config.session.maxOutputTokens } };
  await writeFile(join(dir, "provenance.json"), JSON.stringify({ schema: "art/adaptive-live-trial/v1", id, codeSha: sha, confirmHash: expected, config, startedAt: new Date().toISOString(), note: "real-model results are in real-model/; scripted-reference/ contains no model output" }, null, 2));

  let preflight: Record<string, unknown> | null = null;
  let real: TrialResult | null = null;
  let aborted: string | null = null;
  // The scripted reference never calls the model; it runs at the same code so the two can be compared side by side.
  const scripted = await runTrial({ outRoot: dir, id: "scripted-reference", fixtures: config.fixtures, concurrency: 1, title: "Scripted reference (NOT model results)", armB: () => armBLimits });
  // Created after the scripted reference so that the trial wall clock covers only the model's own work.
  const budgeted = new BudgetedProvider(mistral, config.pricing, config.trial);
  try {
    if (config.preflight) {
      const response = await budgeted.complete({
        messages: [{ role: "user", content: 'Reply with the JSON object {"ok": true} and nothing else.' }],
        maxOutputTokens: PREFLIGHT_OUTPUT_TOKENS, temperature: 0, responseFormat: "json_object", timeoutMs: 15_000,
      });
      let honoured = false;
      try { const value: unknown = JSON.parse(response.text); honoured = typeof value === "object" && value !== null && !Array.isArray(value); } catch { /* not JSON */ }
      preflight = { jsonObjectHonoured: honoured, requestedModel: response.requestedModel, returnedModel: response.returnedModel ?? null, identityMatches: modelIdentityMatches(response), usage: response.usage ?? null, latencyMs: response.latencyMs };
      if (!honoured) aborted = "preflight: json_object output was not honoured";
      else if (!modelIdentityMatches(response)) aborted = `preflight: returned model ${response.returnedModel ?? "(none)"} does not match pinned ${config.model}`;
    }
    if (!aborted) {
      const provider: ModelProvider = budgeted;
      real = await runTrial({
        outRoot: dir, id: "real-model", fixtures: config.fixtures, concurrency: 1,
        title: `Real model ${config.provider}:${config.model}`,
        armBLabel: `adaptive harness driven by the real model ${config.provider}:${config.model} (temperature 0, json_object); cost estimated from configured prices`,
        armB: () => ({ provider, ...armBLimits }),
      });
    }
  } catch (error) {
    // Error text from the provider never contains the key or response bodies (see providers/mistral.ts).
    aborted = error instanceof ProviderError ? `${error.kind}: ${error.message}` : (error instanceof Error ? error.message : String(error)).split("\n")[0]!;
  } finally {
    await writeFile(join(dir, "ledger.json"), JSON.stringify({ ...budgeted.ledger, currency: config.pricing.currency, spendIsEstimate: true }, null, 2));
  }
  await writeFile(join(dir, "report.md"), renderLiveReport({ config, id, sha, preflight, real, scripted, ledger: budgeted.ledger, aborted }));
  return { dir, ledger: budgeted.ledger, preflight, real, scripted, aborted };
}

// ---------------------------------------------------------------- report: real-model and scripted results are never mixed in one table

function table(comparisons: FixtureComparison[]): string[] {
  const out = ["| fixture | held-out | terminal B | verified A / B | missed A / B | false alarms A / B | surfaces A / B / truth | hidden reached A / B | states A / B | B calls | B tokens in / out |", "|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const c of comparisons) {
    out.push(`| ${c.fixture} | ${c.heldOut ? "yes" : "no"} | ${c.B.terminal} | ${c.A.verifiedDefects.length} / ${c.B.verifiedDefects.length} of ${c.truth.defects.length} | ${c.A.missedDefects.length} / ${c.B.missedDefects.length} | ${c.A.falseAlarms.length} / ${c.B.falseAlarms.length} | ${c.A.surfacesVisited.length} / ${c.B.surfacesVisited.length} / ${c.truth.surfaces} | ${c.A.hiddenSurfacesReached.length} / ${c.B.hiddenSurfacesReached.length} of ${c.truth.hiddenSurfaces.length} | ${c.A.truthStatesReached.length} / ${c.B.truthStatesReached.length} of ${c.truth.states.length} | ${c.B.usage.modelCalls} | ${c.B.usage.inputTokens} / ${c.B.usage.outputTokens}${c.B.usage.tokensEstimated ? " (est.)" : ""} |`);
  }
  return out;
}

function details(comparisons: FixtureComparison[]): string[] {
  const out: string[] = [];
  for (const c of comparisons) {
    const d = c.dynamicAdvantage;
    out.push(`- **${c.fixture}**${d.comparable ? "" : " (not comparable: an arm did not complete)"}: verified by B ${JSON.stringify(c.B.verifiedDefects)}; only B ${JSON.stringify(d.defectsOnlyB)}; only A ${JSON.stringify(d.defectsOnlyA)}; B false alarms ${JSON.stringify(c.B.falseAlarms)}; hidden surfaces only B ${JSON.stringify(d.hiddenSurfacesOnlyB)}; states only B ${JSON.stringify(d.statesOnlyB)}.`);
  }
  return out;
}

export function renderLiveReport(input: { config: LiveTrialConfig; id: string; sha: string; preflight: Record<string, unknown> | null; real: TrialResult | null; scripted: TrialResult; ledger: BudgetLedger; aborted: string | null }): string {
  const { config, ledger } = input;
  const lines = [
    `# Mistral fixture trial \`${input.id}\``, "",
    `Code \`${input.sha}\`. Model \`${config.provider}:${config.model}\`. Fixtures only (loopback, containment proxy). ${input.aborted ? `**Aborted: ${input.aborted}.**` : ""}`, "",
    "## Real model results", "",
  ];
  if (input.real) lines.push(...table(input.real.comparisons), "", ...details(input.real.comparisons), "");
  else lines.push("No real-model results (the trial stopped before arm B ran with the model).", "");
  lines.push("## Scripted reference (NOT model results)", "", "Arm B here is the scripted explorer with the fake provider, under the same arm B limits as the real-model run. It shows what the harness can reach when driven by a known-good script; it says nothing about any model.", "", ...table(input.scripted.comparisons), "");
  if (input.real) {
    lines.push("## Real model vs scripted reference (arm B only)", "");
    for (const r of input.real.comparisons) {
      const s = input.scripted.comparisons.find((c) => c.fixture === r.fixture);
      if (!s) continue;
      const diff = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));
      lines.push(`- **${r.fixture}**: defects model-only ${JSON.stringify(diff(r.B.verifiedDefects, s.B.verifiedDefects))}, scripted-only ${JSON.stringify(diff(s.B.verifiedDefects, r.B.verifiedDefects))}; hidden surfaces model-only ${JSON.stringify(diff(r.B.hiddenSurfacesReached, s.B.hiddenSurfacesReached))}, scripted-only ${JSON.stringify(diff(s.B.hiddenSurfacesReached, r.B.hiddenSurfacesReached))}; false alarms model ${r.B.falseAlarms.length} vs scripted ${s.B.falseAlarms.length}.`);
    }
    lines.push("");
  }
  lines.push(
    "## Scoring caveats", "",
    "- \"Verified\" means matched to a seeded defect in fixture ground truth. False alarms are judged only in the truth categories (missing accessible name, broken skip link, dialog focus not returned); other findings are out of scope, not judged.",
    "- \"B verified, A missed\" is partly a scoring artifact: arm A's dialog journeys that end `incomplete` go to needs-review, which is not credited.",
    "- Arm A's off-origin count is 0 by construction (its proxy is the signal); arm B's proxy and policy refusals are listed as denials.",
    "- The held-out fixture was seen during harness development; it is only partly held out.",
    "- Six small synthetic fixtures with one seeded defect each: this measures gross capability and containment, not accuracy on real sites. A single run at temperature 0 says nothing about run-to-run stability.", "",
    "## Budget ledger", "",
    `- Calls ${ledger.calls} (refused by budget ${ledger.refused}), input tokens ${ledger.inputTokens}, output tokens ${ledger.outputTokens}${ledger.estimatedCalls ? ` (${ledger.estimatedCalls} calls without reported usage counted at their reserved worst case)` : ""}.`,
    `- Estimated spend ${ledger.spend.toFixed(4)} ${config.pricing.currency} of a ${config.trial.maxSpend} cap (configured prices × counted tokens; check the provider invoice). ${ledger.stopReason ? `Budget stop: ${ledger.stopReason}.` : ""}`,
    `- Preflight: ${input.preflight ? JSON.stringify(input.preflight) : "not run"}.`,
  );
  return `${lines.join("\n")}\n`;
}

export { costOf };

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
  const config = await loadConfig(flag("config") ?? DEFAULT_CONFIG_PATH);
  const sha = codeSha();
  const shown = plan(config, process.env, sha);
  console.log(shown.lines.join("\n"));
  if (!args.includes("--live")) return;
  if (sha.endsWith("+dirty") || sha === "unknown") throw new Error("refusing a live run on uncommitted or unknown code; commit first so the results name the code that ran");
  const confirm = flag("confirm");
  if (!confirm) throw new Error("--live needs --confirm <hash> from the dry run above");
  console.log("\nLIVE RUN starting: real model calls will be made against loopback fixtures only.");
  const result = await runLive({ config, confirm, ...(flag("id") ? { id: flag("id")! } : {}), codeSha: sha });
  console.log(`\n${result.aborted ? `aborted: ${result.aborted}` : "completed"}\n  report: ${join(result.dir, "report.md")}\n  ledger: calls ${result.ledger.calls}, tokens ${result.ledger.inputTokens}/${result.ledger.outputTokens}, est. spend ${result.ledger.spend.toFixed(4)} ${config.pricing.currency}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
