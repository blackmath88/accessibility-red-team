import { resolve } from "node:path";
import { scanUrl } from "./scan.js";

function usage(): never {
  console.error("Usage: npm run scan -- <url> [--out runs/<name>]");
  process.exit(2);
}

const [command, ...args] = process.argv.slice(2);
if (command !== "scan") usage();

const url = args.find((arg) => !arg.startsWith("--"));
if (!url) usage();

const outIndex = args.indexOf("--out");
const outDir =
  outIndex >= 0 && args[outIndex + 1]
    ? resolve(args[outIndex + 1]!)
    : resolve("runs", new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_"));

scanUrl(url, outDir).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
