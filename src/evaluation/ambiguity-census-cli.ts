import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildCensus, readEvidenceFiles } from "./ambiguity-census.js";

// Usage: npm run evaluation:ambiguity-census -- <frozen-run-dir> [--out census.json]
// Reads frozen evidence only. Never scans a site and never calls a model.
const args = process.argv.slice(2);
const root = args.find((arg) => !arg.startsWith("--") && args[args.indexOf(arg) - 1] !== "--out");
if (!root) throw new Error("usage: evaluation:ambiguity-census -- <frozen-run-dir> [--out census.json]");
const outIndex = args.indexOf("--out");
const census = buildCensus(await readEvidenceFiles(resolve(root)));
const text = `${JSON.stringify(census, null, 2)}\n`;
if (outIndex >= 0 && args[outIndex + 1]) await writeFile(resolve(args[outIndex + 1]!), text);
else process.stdout.write(text);
