// Experimental adaptive track (docs/experiments/ABC_LOCAL_HYBRID.md). Not imported by production code.
// A/B/C comparison on the neutral DEVELOPMENT fixtures (exposed, never held out):
//   A  algorithmic: frontier scheduler + rule table, no model calls
//   B  local LLM (Ollama on loopback) drives the same contained harness
//   C  the same local LLM + at most two advisory Mistral consultations per session (hybrid.ts, hybrid-escalation/v1)
// All three use the frontier-B harness flags (visible ledger, completion accounting, report_candidate) and identical caps.
// Dry run by default: prints the frozen manifest and its confirm hash. --live needs --confirm <hash>, committed code and, for C,
// the Mistral key in ADAPTIVE_MISTRAL_API_KEY. The local endpoint needs no credential.
//   npm run adaptive:abc -- [--segment s1] [--repeats 1] [--fixtures dev-k1] [--conditions A,B] [--live --confirm <hash>]
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BudgetedProvider, type Pricing, type TrialBudget } from "./budget.js";
import { type ExplorationCondition, type Limits } from "./contracts.js";
import { codeSha, runSession, sha256, skillFor } from "./executor.js";
import { CONDITIONS, renderComparison } from "./frontier-compare.js";
import { FUNNEL_VERSION, scoreSession, type SessionFunnel } from "./funnel.js";
import { launchContainedBrowser } from "./containment.js";
import { ESCALATION_VERSION, HybridProvider, MAX_CONSULTS } from "./hybrid.js";
import type { ModelProvider } from "./provider.js";
import { MistralProvider } from "./providers/mistral.js";
import { FrontierScheduler } from "./scheduler.js";
import { startFixtures } from "../../../test/fixtures/adaptive-sites/server.js";
import { DEV_VARIANTS, loadDevTruth } from "../../../test/fixtures/adaptive-sites/variants.js";

export const ABC_SCHEMA = "art/adaptive-abc-trial/v1";

// Frozen per segment: changing any value changes the confirm hash.
export const MANIFEST = {
  schema: ABC_SCHEMA,
  fixtures: [...DEV_VARIANTS],
  conditionOrder: ["A", "B", "C"] as const,
  limits: { maxSteps: 24, maxModelCalls: 12, maxInputTokens: 120_000, maxOutputTokens: 4000, maxWallMs: 180_000, maxResponseBytes: 8_000_000, maxSurfaces: 8 } satisfies Limits,
  harnessCondition: CONDITIONS.B,
  local: { endpoint: "http://127.0.0.1:11434", model: "qwen3-1.7b-ctx8k", base: "qwen3:1.7b Q4_K_M, num_ctx 8192, CPU", extraBody: { reasoning_effort: "none" } },
  consultant: {
    endpoint: "https://api.mistral.ai", model: "mistral-small-2603", apiKeyEnv: "ADAPTIVE_MISTRAL_API_KEY",
    pricing: { currency: "USD", inputPerMillion: 0.15, outputPerMillion: 0.6 } satisfies Pricing,
    escalation: ESCALATION_VERSION, maxConsultsPerSession: MAX_CONSULTS,
  },
  // Per run invocation; the owner cap is USD 5 across all invocations (ledger.json per run, summed in the report).
  consultantBudget: { maxCalls: 30, maxInputTokens: 300_000, maxOutputTokens: 12_000, maxSpend: 0.5, maxWallMs: 3_600_000, minCallIntervalMs: 500 } satisfies TrialBudget,
};

const LOCAL_KEY_ENV = "ADAPTIVE_LOCAL_NO_AUTH";

function args() {
  const argv = process.argv.slice(2);
  const flag = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  return {
    live: argv.includes("--live"), confirm: flag("confirm"), segment: flag("segment") ?? "s1", repeats: Number(flag("repeats") ?? 1),
    fixtures: flag("fixtures")?.split(",") ?? MANIFEST.fixtures, conditions: flag("conditions")?.split(",") ?? [...MANIFEST.conditionOrder],
    outRoot: flag("out") ?? "runs/abc",
    // The one evidence-driven process repair, applied to every arm of a segment (s1 had none): see ABC_LOCAL_HYBRID.md.
    repairs: (flag("repair")?.split(",") ?? []).filter(Boolean),
  };
}

export const confirmHashOf = (plan: unknown, sha: string) => sha256(JSON.stringify(plan) + sha).slice(0, 16);

function localProvider(): ModelProvider {
  return new MistralProvider({ apiKeyEnv: LOCAL_KEY_ENV, model: MANIFEST.local.model, baseUrl: MANIFEST.local.endpoint, extraBody: MANIFEST.local.extraBody, env: { [LOCAL_KEY_ENV]: "local-no-auth" } });
}

async function main() {
  const a = args();
  const sha = codeSha();
  for (const repair of a.repairs) if (repair !== "repeat-guard") throw new Error(`unknown repair ${repair}`);
  const plan = { manifest: MANIFEST, segment: a.segment, repeats: a.repeats, fixtures: a.fixtures, conditions: a.conditions, repairs: a.repairs };
  const hash = confirmHashOf(plan, sha);
  const sessions = a.repeats * a.fixtures.length * a.conditions.length;
  console.log(`A/B/C trial — ${a.live ? "LIVE" : "DRY RUN (no model call)"}\n  code ${sha}\n  segment ${a.segment}, repeats ${a.repeats}, fixtures ${a.fixtures.join(",")}, conditions ${a.conditions.join(",")} -> ${sessions} sessions`);
  console.log(`  repairs: ${a.repairs.join(",") || "none"}`);
  console.log(`  caps per session: ${JSON.stringify(MANIFEST.limits)}\n  local ${MANIFEST.local.model} (${MANIFEST.local.base}) at loopback; consultant ${MANIFEST.consultant.model}, <= ${MAX_CONSULTS}/session, budget ${MANIFEST.consultantBudget.maxSpend} USD per invocation\n  confirm hash ${hash}`);
  if (!a.live) return;
  if (a.confirm !== hash) throw new Error("--confirm does not match this plan and code");
  if (execFileSync("git", ["status", "--porcelain", "--", "src", "package.json", "package-lock.json", "test/fixtures"], { encoding: "utf8" }).trim()) throw new Error("uncommitted code; commit before a live run");
  if (a.conditions.includes("C") && !process.env[MANIFEST.consultant.apiKeyEnv]) throw new Error(`${MANIFEST.consultant.apiKeyEnv} is not set`);

  const dir = resolve(a.outRoot, `${a.segment}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "manifest.json"), JSON.stringify({ ...plan, codeSha: sha, confirmHash: hash, host: execFileSync("hostname", { encoding: "utf8" }).trim(), startedAt: new Date().toISOString() }, null, 2));

  // Preflight the local model: returned identity must match.
  const pre = await localProvider().complete({ messages: [{ role: "user", content: 'Reply with the JSON object {"ok": true}.' }], maxOutputTokens: 16, temperature: 0, responseFormat: "json_object", timeoutMs: 60_000 });
  await writeFile(join(dir, "preflight-local.json"), JSON.stringify({ requestedModel: pre.requestedModel, returnedModel: pre.returnedModel, latencyMs: pre.latencyMs, text: pre.text.slice(0, 80) }, null, 2));
  if (pre.returnedModel !== pre.requestedModel) throw new Error(`local model identity mismatch: ${pre.returnedModel}`);
  // Warm-up (outside every session): evaluate the skill prompt once so the first measured session does not pay the cold prompt
  // evaluation alone. The smoke run showed that cost exceeds the 30 s request cap on CPU. Same for B and C.
  if (a.conditions.some((label) => label !== "A")) {
    const skillText = await readFile(skillFor(MANIFEST.harnessCondition).path, "utf8");
    const warm = await localProvider().complete({ messages: [{ role: "system", content: skillText }, { role: "user", content: 'Warm-up only. Reply with the JSON object {"ok": true}.' }], maxOutputTokens: 16, temperature: 0, responseFormat: "json_object", timeoutMs: 180_000 });
    await writeFile(join(dir, "warmup-local.json"), JSON.stringify({ latencyMs: warm.latencyMs, inputTokens: warm.usage?.inputTokens ?? null }, null, 2));
  }

  const consultant = new BudgetedProvider(new MistralProvider({ apiKeyEnv: MANIFEST.consultant.apiKeyEnv, model: MANIFEST.consultant.model, baseUrl: MANIFEST.consultant.endpoint }), MANIFEST.consultant.pricing, MANIFEST.consultantBudget);
  const server = await startFixtures();
  const contained = await launchContainedBrowser([server.origin]).catch(async (error) => { await server.close(); throw error; });
  const rows: SessionFunnel[] = [];
  try {
    for (let repeat = 1; repeat <= a.repeats; repeat += 1) {
      for (const fixture of a.fixtures as typeof MANIFEST.fixtures) {
        const truth = await loadDevTruth(fixture);
        for (const label of a.conditions) {
          const sessionDir = join(dir, `r${repeat}`, fixture, label);
          await mkdir(sessionDir, { recursive: true });
          let provider: ModelProvider;
          let condition: ExplorationCondition = MANIFEST.harnessCondition;
          if (label === "A") { provider = new FrontierScheduler({ maxPagesPerSource: CONDITIONS.D.sampling.maxPagesPerSource }); condition = CONDITIONS.D; }
          else if (label === "B") provider = localProvider();
          else if (label === "C") provider = new HybridProvider(localProvider(), consultant, (entry) => appendFile(join(sessionDir, "hybrid.jsonl"), JSON.stringify(entry) + "\n"));
          else throw new Error(`unknown condition ${label}`);
          const started = Date.now();
          const result = await runSession({
            config: { schema: "art/adaptive-session/v1", sessionId: `${a.segment}-r${repeat}-${fixture}-${label}`, startUrl: `${server.origin}${truth.startPath}`, allowedOrigins: [server.origin], mode: "fixture", publicTargets: [], limits: MANIFEST.limits },
            provider, outDir: sessionDir, browser: contained.browser, codeSha: sha, condition, refuseRepeatInSameState: a.repairs.includes("repeat-guard"),
          });
          const row = await scoreSession(sessionDir, truth, label, condition);
          rows.push(row);
          console.log(`  r${repeat} ${fixture} ${label}: ${result.status} (${result.reason.slice(0, 80)}), ${result.modelCalls} calls, ${Math.round((Date.now() - started) / 1000)} s, credited ${row.defects.filter((d) => d.credited).length}/${row.defects.length}`);
          await writeFile(join(dir, "ledger.json"), JSON.stringify({ consultant: consultant.ledger, pricing: MANIFEST.consultant.pricing }, null, 2));
        }
      }
    }
  } finally {
    await contained.close();
    await server.close();
  }
  await writeFile(join(dir, "funnel.json"), JSON.stringify({ schema: FUNNEL_VERSION, codeSha: sha, rows }, null, 2));
  await writeFile(join(dir, "comparison.md"), renderComparison(`${a.segment}`, sha, rows));
  console.log(`done: ${dir}\n  consultant ledger: ${JSON.stringify(consultant.ledger)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}

