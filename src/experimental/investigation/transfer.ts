// Experimental investigation slice (ADR-0015): blind local transfer case. Nothing outside src/experimental/ imports this.
// The designer sees only the reported symptom, the machine-readable broker contract and the two neutral page names; the
// fixture source and the answer key stay with the independent fixture author until the conclusion is frozen. Fixtures
// only: this stage has no live target at all.
//   npx tsx src/experimental/investigation/transfer.ts <run> design <attempt>
//   ... <run> revise <attempt> <from>      (needs attempts/<from>/critic.json with requiredChanges and checks)
//   ... <run> validate <attempt>           (pre-execution gate; execute refuses without a passing validation.json)
//   ... <run> execute <attempt>
//   ... <run> conclude <attempt>           (designer states its conclusion from the recorded results; frozen on write)
// Env: ADAPTIVE_MISTRAL_API_KEY, AIL_PRIOR_LEDGERS, AIL_EXTRA_RUN_ROOTS, AIL_MIN_PRIOR_USD (spend.ts), AIL_TRANSFER_SYMPTOM.
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { BudgetedProvider, type Pricing, type TrialBudget } from "../adaptive/budget.js";
import { MistralProvider } from "../adaptive/providers/mistral.js";
import { BROKER_CONTRACT, BROKER_OPS, contractMock, type MockScenario } from "./broker-contract.js";
import { BROKER_VERSION, MeasurementBroker } from "./broker.js";
import { ProposalSchema } from "./proposal.js";
import { runInSandbox, sandboxAvailable } from "./sandbox.js";
import { CONCLUSION_FILE, NAME, SUFFIX, concludeLedgerName, conclusionFileName, normalise, withRunLock } from "./transfer-rules.js";
import { OWNER_CAP_USD, REPO_ROOT, ownerSpend } from "./spend.js";

const MODEL = "mistral-small-2603";
const PRICING: Pricing = { currency: "USD", inputPerMillion: 0.15, outputPerMillion: 0.6 };
const BUDGET: TrialBudget = { maxCalls: 1, maxInputTokens: 30_000, maxOutputTokens: 6_000, maxSpend: 0.02, maxWallMs: 300_000, minCallIntervalMs: 1100 };
const RUNS = join(REPO_ROOT, "runs/ail-transfer");
const TARGETS = ["transfer-a", "transfer-b"];
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const shaBytes = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const exists = (p: string) => access(p).then(() => true, () => false);
const frozen = async (dir: string) => (await exists(join(dir, "revealed.json"))) || (await readdir(dir).catch(() => [] as string[])).some((f) => CONCLUSION_FILE.test(f));

const CheckSchema = z.object({
  id: z.string().min(1).max(60), description: z.string().max(400),
  scenario: z.record(z.string(), z.unknown()).default({}), // contract-mock results overriding the examples, per op
  expectCalls: z.array(z.string()).default([]), // ops the probe must call in this scenario
  resultIncludes: z.array(z.string()).default([]), // substrings the probe's JSON result must contain
});
const CritiqueSchema = z.object({ requiredChanges: z.array(z.string()).min(1).max(8), checks: z.array(CheckSchema).min(1).max(6) }).passthrough();
const ConclusionSchema = z.object({
  defectivePage: z.enum(["transfer-a", "transfer-b", "undetermined"]),
  explanation: z.string().min(1).max(2000),
  // Items may be strings or small objects (relaxed after the first conclusion call returned objects; recorded).
  supportingMeasurements: z.array(z.union([z.string().max(1000), z.record(z.string(), z.unknown())])).max(12),
  unsupportedOrUntested: z.array(z.union([z.string().max(1000), z.record(z.string(), z.unknown())])).max(12),
  confidence: z.enum(["low", "medium", "high"]),
});

async function symptom() {
  const path = process.env["AIL_TRANSFER_SYMPTOM"];
  if (!path) throw new Error("AIL_TRANSFER_SYMPTOM not set");
  return JSON.parse(await readFile(path, "utf8")) as { symptom: string; affectedText: string; viewports: string[] };
}

async function callDesigner(dir: string, attempt: string, system: string, user: string) {
  const ledgerFile = join(dir, `designer-ledger-${attempt}.json`);
  if (await exists(ledgerFile)) throw new Error(`${attempt} already has a designer ledger; use a new name`);
  const spent = (await ownerSpend()).total;
  if (spent + BUDGET.maxSpend > OWNER_CAP_USD) throw new Error(`owner cap: USD ${spent} spent`);
  if (!process.env["ADAPTIVE_MISTRAL_API_KEY"]) throw new Error("ADAPTIVE_MISTRAL_API_KEY not set");
  await mkdir(dir, { recursive: true });
  await writeFile(ledgerFile, JSON.stringify({ reservation: true, spend: BUDGET.maxSpend }, null, 1)); // counts if the call fails
  const provider = new BudgetedProvider(new MistralProvider({ apiKeyEnv: "ADAPTIVE_MISTRAL_API_KEY", model: MODEL }), PRICING, BUDGET);
  const started = Date.now();
  const response = await provider.complete({ messages: [{ role: "system", content: system }, { role: "user", content: user }], maxOutputTokens: 5000, temperature: 0, responseFormat: "json_object", timeoutMs: 120_000 });
  await writeFile(ledgerFile, JSON.stringify({ ...provider.ledger, priorSpendAtCall: spent }, null, 1));
  return { text: response.text, returnedModel: response.returnedModel ?? null, usage: response.usage, ms: Date.now() - started, inputSha256: sha(system + "\n---\n" + user) };
}

function designerSystem(revise: boolean) {
  return `You are the experiment designer in a bounded accessibility investigation. You get a user-reported symptom on a web page and two versions of that page (packet.target is "transfer-a" or "transfer-b"); you do not know whether either version, both or neither show the problem. Propose exactly 3 competing, falsifiable hypotheses for the cause, and ONE executable probe that measures facts able to support or reject them on BOTH versions. Measure the RENDERED result (pixels inside the affected text's own rect), geometry and what is actually on top at points inside that rect, not only computed styles. Never claim a cause from one measurement.
${revise ? "This is a REVISION: implement every REQUIRED CHANGE in the code; the revision is checked by executing the code against the listed checks, not by reading your revisionNote." : ""}
You write ONE JavaScript ES module: export default async function (broker, packet) { ... return <compact JSON-serialisable measurements>; }
It runs in a sandbox with NO network, filesystem or DOM; the only capability is broker.call. packet = { target, viewport, affectedText }.
BROKER CONTRACT (machine-readable, with one example result per op):
${JSON.stringify(BROKER_CONTRACT)}
Reply with ONE JSON object: {"hypotheses":[{"id","statement","prediction","falsifier"} x3],"probe":{"question","falsifier","controls":[...],"limitations":[...],"code":"<the ES module as a string>"}${revise ? ',"revisionNote":"..."' : ""}}`;
}

async function design(run: string, attempt: string, from?: string) {
  const dir = join(RUNS, run), adir = join(dir, "attempts", attempt);
  if (await exists(join(adir, "proposal.json"))) throw new Error(`${attempt} exists`);
  if (await frozen(dir)) throw new Error("this run already has a conclusion or a reveal: no further designs");
  await mkdir(adir, { recursive: true });
  const s = await symptom();
  let user = `SYMPTOM (as reported): ${JSON.stringify(s)}\nPAGES: ${TARGETS.join(", ")} at viewports ${s.viewports.join(", ")}.`;
  if (from) {
    const fdir = join(dir, "attempts", from);
    const critique = CritiqueSchema.parse(JSON.parse(await readFile(join(fdir, "critic.json"), "utf8")));
    user += `\n\nPREVIOUS ATTEMPT ${from} (proposal):\n${await readFile(join(fdir, "proposal.json"), "utf8")}`;
    user += `\n\nRESULTS of executing it:\n${(await readFile(join(fdir, "results.json"), "utf8").catch(() => "(not executed)")).slice(0, 14_000)}`;
    user += `\n\nREQUIRED CHANGES:\n${critique.requiredChanges.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nEXECUTABLE CHECKS your new code must pass (run against a contract mock with these scenario results):\n${JSON.stringify(critique.checks)}`;
  }
  const out = await callDesigner(dir, attempt, designerSystem(Boolean(from)), user);
  await writeFile(join(adir, "designer-input.txt"), `${designerSystem(Boolean(from))}\n\n---\n${user}`);
  await writeFile(join(adir, "designer-raw.json"), JSON.stringify({ model: MODEL, ...out }, null, 1));
  const parsed = ProposalSchema.safeParse(JSON.parse(out.text));
  if (!parsed.success) { await writeFile(join(adir, "schema-rejection.json"), JSON.stringify(parsed.error.issues, null, 1)); throw new Error(`proposal invalid: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`); }
  const proposal = { ...parsed.data, attempt, from: from ?? null, model: MODEL, returnedModel: out.returnedModel, codeSha256: sha(parsed.data.probe.code), inputSha256: out.inputSha256, createdAt: new Date().toISOString() };
  await writeFile(join(adir, "proposal.json"), JSON.stringify(proposal, null, 1));
  await writeFile(join(adir, "probe.mjs"), parsed.data.probe.code);
  console.log(JSON.stringify({ attempt, codeSha256: proposal.codeSha256, hypotheses: proposal.hypotheses.map((h) => h.id), ms: out.ms }, null, 1));
}

// Pre-execution gate. A revisionNote is a claim; only these executed checks count.
async function validate(run: string, attempt: string) {
  const dir = join(RUNS, run), adir = join(dir, "attempts", attempt);
  const proposal = JSON.parse(await readFile(join(adir, "proposal.json"), "utf8")) as { codeSha256: string; from: string | null };
  const code = await readFile(join(adir, "probe.mjs"), "utf8");
  const failures: string[] = [], report: Record<string, unknown> = { attempt, codeSha256: sha(code), proposalCodeSha256: proposal.codeSha256 };
  if (sha(code) !== proposal.codeSha256) failures.push("probe.mjs differs from the proposal's code");
  if (await frozen(dir)) failures.push("this run already has a conclusion or a reveal");
  // 1. Duplicate code: identical to any earlier attempt in this run.
  const dupes: string[] = [];
  for (const a of await readdir(join(dir, "attempts"))) {
    if (a === attempt) continue;
    const other = await readFile(join(dir, "attempts", a, "probe.mjs"), "utf8").catch(() => null);
    if (other !== null && (sha(other) === sha(code) || sha(normalise(other)) === sha(normalise(code)))) dupes.push(a);
  }
  report["duplicateOf"] = dupes; if (dupes.length) failures.push(`code identical to ${dupes.join(", ")}`);
  // 2. Static op scan: literal op names must exist; non-literal op names are flagged.
  const literal = [...code.matchAll(/\.call\(\s*(['"`])([^'"`]+)\1/g)].map((m) => m[2]!);
  const unknown = literal.filter((op) => !(BROKER_OPS as string[]).includes(op));
  const dynamic = (code.match(/\.call\(\s*[^'"`\s]/g) ?? []).length;
  report["ops"] = { literal: [...new Set(literal)], unknown, dynamicCallSites: dynamic };
  if (unknown.length) failures.push(`unknown broker ops: ${unknown.join(", ")}`);
  // 3. Contract-mock dry run: the probe must complete and make no call the broker would deny.
  const dry = contractMock();
  const out = await runInSandbox(code, { target: "transfer-a", viewport: "1440x900", affectedText: "example text" }, dry.handler);
  const denied = dry.calls.filter((c) => c.denied);
  report["dryRun"] = { state: out.state, error: out.error, calls: dry.calls.length, denied: denied.map((d) => ({ op: d.op, reason: d.denied })) };
  if (out.state !== "completed") failures.push(`dry run ${out.state}: ${out.error ?? ""}`.trim());
  if (denied.length) failures.push(`dry run made ${denied.length} call(s) the broker would deny`);
  // 4. Required repair checks from the critique of the attempt this one revises.
  if (proposal.from) {
    const critique = CritiqueSchema.parse(JSON.parse(await readFile(join(dir, "attempts", proposal.from, "critic.json"), "utf8")));
    const checks = [];
    for (const c of critique.checks) {
      const mock = contractMock(c.scenario as MockScenario);
      const r = await runInSandbox(code, { target: "transfer-a", viewport: "1440x900", affectedText: "example text" }, mock.handler);
      const called = new Set(mock.calls.map((x) => x.op));
      const json = JSON.stringify(r.result ?? null);
      const missingCalls = c.expectCalls.filter((op) => !called.has(op));
      const missingText = c.resultIncludes.filter((t) => !json.includes(t));
      const pass = r.state === "completed" && !missingCalls.length && !missingText.length && !mock.calls.some((x) => x.denied);
      checks.push({ id: c.id, pass, state: r.state, error: r.error, missingCalls, missingText });
      if (!pass) failures.push(`required check ${c.id} failed`);
    }
    report["requiredChecks"] = checks;
  }
  report["passed"] = failures.length === 0; report["failures"] = failures; report["at"] = new Date().toISOString();
  await writeFile(join(adir, "validation.json"), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
}

async function execute(run: string, attempt: string) {
  if (!sandboxAvailable().ok) throw new Error("no verified sandbox");
  const dir = join(RUNS, run), adir = join(dir, "attempts", attempt);
  const v = JSON.parse(await readFile(join(adir, "validation.json"), "utf8").catch(() => "{}")) as { passed?: boolean; codeSha256?: string };
  const code = await readFile(join(adir, "probe.mjs"), "utf8");
  if (!v.passed || v.codeSha256 !== sha(code)) throw new Error("execution refused: no passing validation for this exact code");
  if (await frozen(dir)) throw new Error("execution refused: this run already has a conclusion or a reveal");
  const s = await symptom();
  const broker = new MeasurementBroker({ runDir: dir, ledgerPath: join(dir, "no-live-ledger.json"), fixtureDir: join(REPO_ROOT, "test/fixtures/investigation"), liveAllowed: false, maxLiveLoads: 0, minGapMs: 10_000, resourcePolicy: "same-origin" });
  const results: Record<string, unknown> = {};
  try {
    for (const target of TARGETS) for (const viewport of s.viewports) {
      const out = await runInSandbox(code, { target, viewport, affectedText: s.affectedText }, broker.forAttempt(`${attempt}-${target}-${viewport}`));
      results[`${target}@${viewport}`] = { ...out, target, viewport, broker: BROKER_VERSION };
      console.log(`${target}@${viewport}`, out.state, out.error ?? "", JSON.stringify(out.result).slice(0, 200));
    }
  } finally {
    await broker.close();
    await writeFile(join(adir, "results.json"), JSON.stringify(results, null, 1));
    await writeFile(join(adir, "broker-log.json"), JSON.stringify({ log: broker.log, blocked: broker.blocked }, null, 1));
  }
}

// Every page/viewport gets its own capped share; a single overall cut once hid transfer-b entirely (conclusion.json).
function measurementsForConclusion(json: string, cap = 9_000): string {
  return Object.entries(JSON.parse(json) as Record<string, { state?: string; error?: string | null; result?: unknown }>)
    .map(([k, v]) => `${k}: ${JSON.stringify({ state: v.state, error: v.error, result: v.result }).slice(0, cap)}`).join("\n");
}

async function conclude(run: string, attempt: string) {
  const dir = join(RUNS, run);
  await withRunLock(dir, "conclude", () => concludeLocked(dir, attempt));
}

async function concludeLocked(dir: string, attempt: string) {
  const adir = join(dir, "attempts", attempt);
  // One conclusion file per call, never overwritten; none at all once the answer key has been revealed for this run.
  if (await exists(join(dir, "revealed.json"))) throw new Error("the answer key was revealed: no further conclusions");
  const suffix = process.env["AIL_CONCLUDE_SUFFIX"] ?? "";
  const conclusionFile = join(dir, conclusionFileName(suffix));
  const s = await symptom();
  const system = `You concluded an accessibility investigation. From the symptom, your hypotheses and the RECORDED measurements only, state which page version shows the reported problem and why. Say "undetermined" if the measurements do not establish it. Separate what the measurements support from what is untested. Reply with ONE JSON object: {"defectivePage":"transfer-a"|"transfer-b"|"undetermined","explanation","supportingMeasurements":[...],"unsupportedOrUntested":[...],"confidence":"low"|"medium"|"high"}`;
  const user = `SYMPTOM: ${JSON.stringify(s)}\n\nPROPOSAL:\n${await readFile(join(adir, "proposal.json"), "utf8")}\n\nMEASUREMENTS (per page and viewport, each capped):\n${measurementsForConclusion(await readFile(join(adir, "results.json"), "utf8"))}`;
  if (await exists(conclusionFile)) throw new Error(`${conclusionFile} already exists`);
  const name = concludeLedgerName(attempt, suffix);
  const out = await callDesigner(dir, name, system, user);
  await writeFile(join(adir, `${name}-raw.json`), JSON.stringify({ model: MODEL, ...out }, null, 1)); // kept even if parsing fails
  const parsed = ConclusionSchema.parse(JSON.parse(out.text));
  const body = JSON.stringify({ ...parsed, fromAttempt: attempt, model: MODEL, returnedModel: out.returnedModel, inputSha256: out.inputSha256, frozenAt: new Date().toISOString() }, null, 1);
  await writeFile(conclusionFile, body, { flag: "wx" });
  console.log(body, "\nconclusionSha256", sha(body));
}

// Writes the reveal marker (hashes of every frozen conclusion and of the key) BEFORE the key may be read; afterwards
// validate, execute and conclude refuse for this run.
async function reveal(run: string, keyPath: string) {
  const dir = join(RUNS, run);
  await withRunLock(dir, "reveal", () => revealLocked(dir, keyPath));
}

async function revealLocked(dir: string, keyPath: string) {
  const conclusions = (await readdir(dir)).filter((f) => CONCLUSION_FILE.test(f));
  if (!conclusions.length) throw new Error("nothing frozen: refusing to reveal");
  const frozenBeforeReveal = Object.fromEntries(await Promise.all(conclusions.map(async (f) => [f, sha(await readFile(join(dir, f), "utf8"))])));
  // Every recorded attempt file is hashed too, so later edits to proposals, results or gate reports are detectable.
  const recorded: Record<string, string> = {};
  for (const a of await readdir(join(dir, "attempts")).catch(() => [] as string[]))
    for (const f of await readdir(join(dir, "attempts", a))) recorded[`attempts/${a}/${f}`] = shaBytes(await readFile(join(dir, "attempts", a, f)));
  // Broker screenshots too, hashed as bytes; subdirectories are skipped.
  for (const f of await readdir(join(dir, "artifacts"), { withFileTypes: true }).catch(() => []))
    if (f.isFile()) recorded[`artifacts/${f.name}`] = shaBytes(await readFile(join(dir, "artifacts", f.name)));
  const body = JSON.stringify({ revealedAt: new Date().toISOString(), frozenBeforeReveal, recordedAttemptFiles: recorded, keySha256: sha(await readFile(keyPath, "utf8")) }, null, 1);
  await writeFile(join(dir, "revealed.json"), body, { flag: "wx" });
  console.log(body);
}

const [run, stage, attempt, from] = process.argv.slice(2);
if (!run || !stage || !attempt) { console.error("usage: transfer.ts <run> design|revise|validate|execute|conclude <attempt> [from] | reveal <key-path>"); process.exit(2); }
const suffixOk = !process.env["AIL_CONCLUDE_SUFFIX"] || SUFFIX.test(process.env["AIL_CONCLUDE_SUFFIX"]);
if (!NAME.test(run) || (stage !== "reveal" && !NAME.test(attempt)) || (from !== undefined && !NAME.test(from)) || !suffixOk) { console.error("run, attempt and from must match [a-z0-9-]; AIL_CONCLUDE_SUFFIX must match [a-z0-9]"); process.exit(2); }
if (stage === "revise" && !from) { console.error("revise needs <from>"); process.exit(2); }
const go = stage === "reveal" ? reveal(run, attempt) : stage === "design" ? design(run, attempt) : stage === "revise" ? design(run, attempt, from) : stage === "validate" ? validate(run, attempt)
  : stage === "execute" ? execute(run, attempt) : stage === "conclude" ? conclude(run, attempt) : Promise.reject(new Error(`unknown stage ${stage}`));
go.catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
