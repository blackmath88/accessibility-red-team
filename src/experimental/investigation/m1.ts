// Experimental investigation slice (ADR-0015): Basel M1, the faint required-field hint on www.bs.ch/apps/zonensuche.
// Nothing outside src/experimental/ imports this module. Stages (all recorded under runs/ail-m1/<run>/):
//   design   designer model (Mistral, pinned) proposes competing hypotheses + an executable probe from the baseline packet
//   execute  run a recorded probe in the bwrap sandbox against local fixtures and/or the one approved live URL
//   revise   designer revises the probe from the recorded results (new attempt, new code hash)
// Critic/judge are fresh Claude contexts run by the coordinator over the recorded packets (not part of this script).
//   npx tsx src/experimental/investigation/m1.ts <run> design|revise <attempt> | execute <attempt> <target[,target]> <viewport[,viewport]> [--live]
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { BudgetedProvider, type Pricing, type TrialBudget } from "../adaptive/budget.js";
import { MistralProvider } from "../adaptive/providers/mistral.js";
import { BROKER_VERSION, LIVE_URL, MeasurementBroker, VIEWPORTS } from "./broker.js";
import { SANDBOX_VERSION, runInSandbox, sandboxAvailable } from "./sandbox.js";

const MODEL = "mistral-small-2603";
const PRICING: Pricing = { currency: "USD", inputPerMillion: 0.15, outputPerMillion: 0.6 };
const BUDGET: TrialBudget = { maxCalls: 4, maxInputTokens: 60_000, maxOutputTokens: 12_000, maxSpend: 0.05, maxWallMs: 600_000, minCallIntervalMs: 1100 };
const OWNER_CAP_USD = 5;
const PRIOR_LEDGERS = "/home/achim/Work/art-abc/runs/abc"; // A/B/C/M ledgers (USD 0.0726 reported)
const FIXTURES = ["overlay", "no-overlay", "clean-control", "opacity-control"];
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export const HypothesisSchema = z.object({ id: z.string().min(1).max(80), statement: z.string().min(1).max(1500), prediction: z.string().min(1).max(1500), falsifier: z.string().min(1).max(1500) });
export const ProposalSchema = z.object({
  hypotheses: z.array(HypothesisSchema).min(3).max(3),
  probe: z.object({ question: z.string().min(1).max(1500), falsifier: z.string().min(1).max(2000), controls: z.array(z.string()).max(10), limitations: z.array(z.string()).max(12), code: z.string().min(50).max(12_000) }),
  revisionNote: z.string().max(4000).optional(),
});

const API_DOC = `You write ONE JavaScript ES module: export default async function (broker, packet) { ... return <JSON-serialisable measurements>; }
It runs in an isolated sandbox with NO network, NO filesystem, NO DOM. The only capability is: await broker.call(op, args). Allowed ops:
- open {target: packet.target, viewport: packet.viewport}  (always call first; target and viewport are given in packet)
- viewport {} -> {innerWidth, innerHeight, devicePixelRatio, scrollX, scrollY, docHeight}
- findText {text (<=80 chars), max (1-5)} -> {count, elements:[{handle, tag, id, cls, text, rect{x,y,width,height} (viewport coords), style{color, backgroundColor, opacity, position, zIndex, visibility, display, fontSize, fontWeight, top}, effectiveOpacity, nonDefaultAncestors[{tag,cls,opacity,filter,blend}]}]}
- query {selector (CSS, <=200 chars), max (1-10)} -> same shape as findText
- elementsFromPoint {points:[{x,y}] (1-20 integer viewport points)} -> [{point, stack:[{tag,id,cls,text,position,zIndex,backgroundColor,opacity,rect}] (topmost first, <=8)}]
- scrollTo {y (0..20000)} -> {scrollY}
- pixels {clip:{x,y,width<=800,height<=300}} (viewport coords) -> {min, p01, p05, p50, max, below{100,150,200,230} pixel counts, histogram16, pixels, artifact}  greyscale 0..255 of the RENDERED screenshot
- screenshot {} -> {artifact}
Errors throw "broker denied: <reason>"; catch them and record. Return a compact object (no images). No loops over more than 30 calls.`;

function baselinePacket() {
  return {
    observation: "Required-field hint «* muss ausgefüllt werden» on https://www.bs.ch/apps/zonensuche looked almost invisible in screenshots.",
    knownFacts: [
      "Computed style of span.text-xs with that text: color rgb(119,119,119), background resolved to rgb(255,255,255), 12px, weight 400 → computed contrast 4.48:1 (axe 4.47:1).",
      "Screenshots (1440x900 viewport, DPR 1) taken AFTER element.scrollIntoView({block:'center'}) at 1 s and at 5 s: darkest grey 242 on 255 inside a 160x20 crop at x 950-1110, y 382-402 → ~1.12:1. The crop region was located by eye.",
      "Ancestor opacity chain of the hint after 5 s: effective opacity 1, no transitions found.",
      "Saved DOM (scanner run) shows in the same card: <h3 class=\"text-xl font-bold text-green-700 mb-10 py-10 sticky print:static z-8 transition-all duration-250 ease-in-out bg-white/90\" style=\"top: var(--base-sticky-top);\">Abfuhrzonensuche</h3>.",
      "A cookie banner covers the lower part of the viewport on first load (no choice was made).",
    ],
    unknowns: ["whether the sampled pixels are the glyphs at all (crop placement)", "whether something overlaps the hint and in which scroll state", "whether the faintness exists without scrolling"],
    candidateExplanations: ["crop/antialiasing artefact", "inherited opacity", "translucent sticky overlap", "offscreen/clipped/scroll-state dependence"],
    fixtures: { "overlay": "local copy: sticky translucent white heading overlapping the hint", "no-overlay": "same, overlay removed", "clean-control": "plain hint, nothing faint", "opacity-control": "hint faint because parent opacity 0.12, no overlap" },
  };
}

async function priorSpend() {
  let total = 0;
  for (const d of await readdir(PRIOR_LEDGERS).catch(() => [] as string[])) {
    const raw = await readFile(join(PRIOR_LEDGERS, d, "ledger.json"), "utf8").catch(() => null);
    if (raw) { const j = JSON.parse(raw) as { consultant: { spend: number }; direct?: { spend: number } }; total += j.consultant.spend + (j.direct?.spend ?? 0); }
  }
  for (const d of await readdir("runs/ail-m1").catch(() => [] as string[])) {
    for (const f of await readdir(join("runs/ail-m1", d)).catch(() => [] as string[])) {
      if (!f.startsWith("designer-ledger")) continue;
      total += (JSON.parse(await readFile(join("runs/ail-m1", d, f), "utf8")) as { spend: number }).spend;
    }
  }
  return total;
}

async function designer(run: string, attempt: string, mode: "design" | "revise") {
  const dir = resolve("runs/ail-m1", run);
  await mkdir(join(dir, "attempts", attempt), { recursive: true });
  const spent = await priorSpend();
  if (spent + BUDGET.maxSpend > OWNER_CAP_USD) throw new Error(`owner cap: ${spent} spent`);
  if (!process.env["ADAPTIVE_MISTRAL_API_KEY"]) throw new Error("ADAPTIVE_MISTRAL_API_KEY not set");
  const provider = new BudgetedProvider(new MistralProvider({ apiKeyEnv: "ADAPTIVE_MISTRAL_API_KEY", model: MODEL }), PRICING, BUDGET);
  const packet = baselinePacket();
  let context = `BASELINE EVIDENCE (frozen):\n${JSON.stringify(packet, null, 1)}`;
  if (mode === "revise") {
    // Previous designed attempt (replays are not designs); its fresh-replay results are added when present.
    const prev = (await readdir(join(dir, "attempts"))).filter((a) => a !== attempt && !a.endsWith("-replay")).sort().at(-1)!;
    const prevProposal = await readFile(join(dir, "attempts", prev, "proposal.json"), "utf8");
    const results = await readFile(join(dir, "attempts", prev, "results.json"), "utf8");
    const replay = await readFile(join(dir, "attempts", `${prev}-replay`, "results.json"), "utf8").catch(() => "");
    const critic = await readFile(join(dir, "attempts", prev, "critic.json"), "utf8").catch(() => "{}");
    context += `\n\nPREVIOUS ATTEMPT ${prev} (proposal):\n${prevProposal}\n\nRESULTS of executing it (fixtures and live):\n${perTarget(results, 3_000)}`;
    if (replay) context += `\n\nFRESH REPLAY of ${prev} (new process and browser, same code; includes the 390x844 viewport):\n${perTarget(replay, 6_000)}`;
    context += `\n\nCRITIC REVIEW of the previous attempt:\n${critic.slice(0, 3000)}`;
  }
  const system = `You are the experiment designer in a bounded accessibility investigation. Propose exactly 3 competing, falsifiable hypotheses for WHY the hint looks faint, and ONE executable probe that measures facts able to support or reject them. The probe will be run on each local fixture and on the live page (packet.target), at the viewports given in packet.viewport. Measure geometry, overlap (elementsFromPoint at points inside the hint's own rect), computed styles and RENDERED pixels inside the hint's own rect (do not rely on the old hand-placed crop). Compare the page as loaded (no scrolling) with the scrolled state that put the hint in the vertical centre (scrollTo so the hint's centre is at innerHeight/2). Never claim a cause from one measurement; say what would falsify it.
${mode === "revise" ? "This is a REVISION: change the probe in response to what the results and critic showed (fix errors, add the measurement that would discriminate between the remaining hypotheses), and explain the change in revisionNote." : ""}
${API_DOC}
Reply with ONE JSON object: {"hypotheses":[{"id","statement","prediction","falsifier"} x3],"probe":{"question","falsifier","controls":[...],"limitations":[...],"code":"<the ES module as a string>"}${mode === "revise" ? ',"revisionNote":"..."' : ""}}`;
  const response = await provider.complete({ messages: [{ role: "system", content: system }, { role: "user", content: context }], maxOutputTokens: 5000, temperature: 0, responseFormat: "json_object", timeoutMs: 120_000 });
  await writeFile(join(dir, `designer-ledger-${attempt}.json`), JSON.stringify({ ...provider.ledger }, null, 1)); // one per call; all are summed
  await writeFile(join(dir, "attempts", attempt, "designer-raw.json"), JSON.stringify({ model: MODEL, returnedModel: response.returnedModel, usage: response.usage, text: response.text }, null, 1));
  await writeFile(join(dir, "attempts", attempt, "designer-input.txt"), `${system}\n\n---\n${context}`);
  await accept(run, attempt, mode, sha(context));
}

// Compact JSON per target, each capped, so a late target (e.g. the mobile viewport) is not truncated away.
function perTarget(json: string, cap: number): string {
  return Object.entries(JSON.parse(json) as Record<string, unknown>).map(([k, v]) => `${k}: ${JSON.stringify(v).slice(0, cap)}`).join("\n");
}

// Validates the saved designer output (also used to re-validate after a schema correction without a new paid call).
async function accept(run: string, attempt: string, mode: string, inputSha256?: string) {
  const dir = resolve("runs/ail-m1", run);
  const raw = JSON.parse(await readFile(join(dir, "attempts", attempt, "designer-raw.json"), "utf8")) as { returnedModel: string | null; text: string };
  const parsed = ProposalSchema.safeParse(JSON.parse(raw.text));
  if (!parsed.success) throw new Error(`proposal invalid: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  const proposal = { ...parsed.data, attempt, mode, model: MODEL, returnedModel: raw.returnedModel ?? null, codeSha256: sha(parsed.data.probe.code), inputSha256: inputSha256 ?? null, createdAt: new Date().toISOString() };
  await writeFile(join(dir, "attempts", attempt, "proposal.json"), JSON.stringify(proposal, null, 1));
  await writeFile(join(dir, "attempts", attempt, "probe.mjs"), parsed.data.probe.code);
  console.log(JSON.stringify({ attempt, hypotheses: proposal.hypotheses.map((h) => h.id + ": " + h.statement.slice(0, 110)), codeSha256: proposal.codeSha256 }, null, 1));
}

async function execute(run: string, attempt: string, targets: string[], viewports: string[], live: boolean) {
  if (!sandboxAvailable().ok) throw new Error("LIVE DYNAMIC EXECUTION BLOCKED: no verified sandbox");
  const dir = resolve("runs/ail-m1", run);
  const code = await readFile(join(dir, "attempts", attempt, "probe.mjs"), "utf8");
  const broker = new MeasurementBroker({ runDir: dir, ledgerPath: resolve("runs/ail-m1/live-ledger.json"), fixtureDir: resolve("test/fixtures/investigation"), liveAllowed: live, maxLiveLoads: 16, minGapMs: 10_000 });
  const resultsPath = join(dir, "attempts", attempt, "results.json");
  const results: Record<string, unknown> = JSON.parse(await readFile(resultsPath, "utf8").catch(() => "{}"));
  try {
    for (const target of targets) {
      if (target !== "live" && !FIXTURES.includes(target)) throw new Error(`unknown target ${target}`);
      for (const viewport of viewports) {
        if (!VIEWPORTS[viewport]) throw new Error(`viewport ${viewport}`);
        const key = `${target}@${viewport}`;
        const out = await runInSandbox(code, { target, viewport }, broker.forAttempt(`${attempt}-${target}-${viewport}`));
        results[key] = { ...out, target, viewport, url: target === "live" ? LIVE_URL : `fixture:${target}`, broker: BROKER_VERSION };
        console.log(key, out.state, out.error ?? "", JSON.stringify(out.result).slice(0, 300));
      }
    }
  } finally {
    await broker.close();
    await writeFile(resultsPath, JSON.stringify(results, null, 1));
    await writeFile(join(dir, "attempts", attempt, `broker-log-${Date.now()}.json`), JSON.stringify(broker.log, null, 1));
    await writeFile(join(dir, "provenance.json"), JSON.stringify({ sandbox: SANDBOX_VERSION, broker: BROKER_VERSION, model: MODEL, node: process.version }, null, 1));
  }
}

const [run, stage, attempt, t, v] = process.argv.slice(2);
if (!run || !stage || !attempt) { console.error("usage: m1.ts <run> design|revise <attempt> | execute <attempt> <targets> <viewports> [--live]"); process.exit(2); }
(stage === "accept" ? accept(run, attempt, t ?? "design") : stage === "execute" ? execute(run, attempt, t!.split(","), (v ?? "1440x900").split(","), process.argv.includes("--live")) : designer(run, attempt, stage as "design" | "revise"))
  .catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
