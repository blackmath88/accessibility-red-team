import { resolve } from "node:path";
import { scanUrl } from "./scan.js";
import { scoutSite } from "./scout/scout.js";
import { buildReport } from "./report/build.js";

function usage(): never {
  console.error([
    "Usage:",
    "  npm run scan -- <url> [--out runs/<name>]",
    "  npm run scout -- <url> [--out runs/<name>/surface.json] [--max-pages 20] [--max-depth 2]",
    "  npm run report -- <run-dir> --profile requirements/profiles/ch.federal.yml",
  ].join("\n"));
  process.exit(2);
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const [command, ...args] = process.argv.slice(2);
if (!command) usage();

if (command === "scan") {
  const url = args.find((arg) => !arg.startsWith("--"));
  if (!url) usage();
  const outDir = valueAfter(args, "--out")
    ? resolve(valueAfter(args, "--out")!)
    : resolve("runs", new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_"));

  scanUrl(url, outDir).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
} else if (command === "scout") {
  const url = args.find((arg) => !arg.startsWith("--"));
  if (!url) usage();
  const maxPages = Number(valueAfter(args, "--max-pages") ?? "20");
  const maxDepth = Number(valueAfter(args, "--max-depth") ?? "2");
  const out = valueAfter(args, "--out")
    ? resolve(valueAfter(args, "--out")!)
    : resolve("runs", new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_"), "surface.json");

  scoutSite(url, { maxPages, maxDepth, out })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
} else if (command === "report") {
  const runDir = args.find((arg) => !arg.startsWith("--"));
  const profilePath = valueAfter(args, "--profile");
  if (!runDir || !profilePath) usage();

  buildReport({
    runDir: resolve(runDir),
    profilePath: resolve(profilePath),
  })
    .then((result) => console.log(JSON.stringify(result.summary, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
} else {
  usage();
}
