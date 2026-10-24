// Experimental CLI: runs both arms against the local fixtures with the fake provider and writes a sealed A/B comparison.
//   npm run adaptive:fixture-trial [-- --fixtures a,b --out runs/adaptive --id my-trial]
// Localhost fixtures only. No model call, no network beyond 127.0.0.1.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { runArmA, runArmB, sealArm } from "./arms.js";
import { validateCandidate, type CandidateValidation } from "./candidate-checks.js";
import { compareFixture, renderMarkdown, type FixtureComparison } from "./compare.js";
import { observe } from "./observer.js";
import { FIXTURE_NAMES, loadTruth, type FixtureName } from "../../../test/fixtures/adaptive-sites/server.js";

export type TrialResult = { id: string; dir: string; comparisons: FixtureComparison[]; candidate: CandidateValidation | null };

export async function runTrial(options: { outRoot: string; id?: string; fixtures?: FixtureName[]; concurrency?: number }): Promise<TrialResult> {
  const id = options.id ?? new Date().toISOString().replace(/[:.]/g, "-");
  const dir = resolve(options.outRoot, id);
  const fixtures = options.fixtures ?? [...FIXTURE_NAMES];
  await mkdir(dir, { recursive: true });
  const comparisons = new Map<FixtureName, FixtureComparison>();

  const one = async (fixture: FixtureName) => {
    const truth = await loadTruth(fixture);
    const base = join(dir, fixture);
    // Independent arms: separate servers, browsers and directories, run side by side, neither given anything from the other.
    await Promise.all([
      runArmA(fixture, truth.startPath, { outDir: join(base, "A") }),
      runArmB(fixture, truth.startPath, { outDir: join(base, "B") }),
    ]);
    await Promise.all([sealArm(join(base, "A"), "A"), sealArm(join(base, "B"), "B")]);
    const report = await observe(join(base, "A"), join(base, "B"));
    await writeFile(join(base, "observer.json"), JSON.stringify(report, null, 2));
    const comparison = await compareFixture(fixture, join(base, "A"), join(base, "B"), report);
    await writeFile(join(base, "comparison.json"), JSON.stringify(comparison, null, 2));
    comparisons.set(fixture, comparison);
  };

  const queue = [...fixtures];
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 3) }, async () => {
    for (let fixture = queue.shift(); fixture; fixture = queue.shift()) await one(fixture);
  }));

  let candidate: CandidateValidation | null = null;
  if (fixtures.includes("menu-dialog")) {
    candidate = await validateCandidate({
      dev: { fixture: "menu-dialog", A: join(dir, "menu-dialog", "A"), B: join(dir, "menu-dialog", "B") },
      ...(fixtures.includes("heldout-menus") ? { heldOut: { fixture: "heldout-menus" as const, A: join(dir, "heldout-menus", "A"), B: join(dir, "heldout-menus", "B") } } : {}),
    });
    await writeFile(join(dir, "candidate-validation.json"), JSON.stringify(candidate, null, 2));
  }
  const ordered = fixtures.map((fixture) => comparisons.get(fixture)!);
  await writeFile(join(dir, "comparison.json"), JSON.stringify({ schema: "art/adaptive-trial/v1", id, comparisons: ordered, candidate }, null, 2));
  await writeFile(join(dir, "comparison.md"), renderMarkdown(id, ordered, { candidate }));
  return { id, dir, comparisons: ordered, candidate };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
  const requested = flag("fixtures")?.split(",") as FixtureName[] | undefined;
  if (requested?.some((name) => !(FIXTURE_NAMES as readonly string[]).includes(name))) throw new Error(`unknown fixture; choose from ${FIXTURE_NAMES.join(", ")}`);
  const result = await runTrial({ outRoot: flag("out") ?? "runs/adaptive", ...(flag("id") ? { id: flag("id")! } : {}), ...(requested ? { fixtures: requested } : {}) });
  console.log(`adaptive fixture trial ${result.id}\n  comparison: ${join(result.dir, "comparison.md")}\n  machine-readable: ${join(result.dir, "comparison.json")}`);
  for (const c of result.comparisons) {
    console.log(`  ${c.fixture.padEnd(20)} verified A ${c.A.verifiedDefects.length}/${c.truth.defects.length}  B ${c.B.verifiedDefects.length}/${c.truth.defects.length}  baseline missed a state/surface/defect: ${c.dynamicAdvantage.reachedStateBaselineMissed}`);
  }
  if (result.candidate) console.log(`  observer candidate ${result.candidate.check}: ${result.candidate.status} (promoted: ${result.candidate.promoted})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
