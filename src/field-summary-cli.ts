import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ProbeResultSchema } from "./contracts.js";
import { JourneyRunSchema } from "./journeys/contracts.js";
import { summarizeFieldEvidenceQuality } from "./field-evidence.js";

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

const [baseDir, siteId] = process.argv.slice(2);
if (!baseDir || !siteId) {
  throw new Error("Usage: tsx src/field-summary-cli.ts <site-run-dir> <site-id>");
}

const scanDir = join(baseDir, "scan");
const journeyDir = join(baseDir, "journey");

const summary = await readJson(join(scanDir, "summary.json"));
const coverage = await readJson(join(scanDir, "coverage.json"));
const probesRaw = await readJson(join(scanDir, "probe-results.json"));
const journeys = JourneyRunSchema.parse(await readJson(join(journeyDir, "journey-results.json")));
const probes = Array.isArray(probesRaw) ? probesRaw.map((item) => ProbeResultSchema.parse(item)) : [];

const output = {
  schema: "art/field-validation-summary/v2",
  siteId,
  scan: summary,
  coverageEngine: coverage.engine,
  evidenceQuality: summarizeFieldEvidenceQuality(probes),
  journeys: journeys.results.map((result) => ({
    journeyId: result.journeyId,
    journeyVersion: result.journeyVersion,
    kind: result.kind,
    outcome: result.outcome,
    evidenceCount: result.evidence.length,
    summary: result.summary,
  })),
};

await writeFile(join(baseDir, "field-summary.json"), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
