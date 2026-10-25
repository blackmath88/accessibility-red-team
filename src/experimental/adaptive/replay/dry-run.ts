import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { EVALUATOR_ANSWERS, scoreAnswer } from "./evaluator.js";
import { ReplayManifestSchema } from "./manifest.js";
import { runFakeReplay } from "./runner.js";

export async function dryRun() {
  const manifest = ReplayManifestSchema.parse(JSON.parse(await readFile(new URL("./manifest.json", import.meta.url), "utf8")));
  const result = await runFakeReplay(manifest);
  const cells = new Map(manifest.requests.map((cell) => [cell.id, cell]));
  const scores = result.records.map((record) => ({
    requestId: record.requestId,
    ...(record.answer ? scoreAnswer(record.answer, EVALUATOR_ANSWERS[cells.get(record.requestId)!.point]) : { nextAction: false, evidenceInterpretation: false }),
  }));
  return {
    ...result, modelSlots: manifest.modelSlots, scores,
    totals: { nextAction: scores.filter((score) => score.nextAction).length, evidenceInterpretation: scores.filter((score) => score.evidenceInterpretation).length },
    qualityClaim: "none: scripted synthetic mechanism check",
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { records: _records, scores: _scores, ...summary } = await dryRun();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
