import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const SKIP = new Set(["node_modules", "dist", ".git", "runs", ".wrangler"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|js|mjs|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

describe("production isolation of the experimental adaptive track", () => {
  it("no file outside src/experimental and test/ imports src/experimental", () => {
    const offenders = walk(ROOT)
      .map((file) => relative(ROOT, file))
      .filter((file) => !file.startsWith("src/experimental/") && !file.startsWith("test/"))
      .filter((file) => /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["'][^"']*experimental\//.test(readFileSync(join(ROOT, file), "utf8")));
    assert.deepEqual(offenders, []);
  });
  it("production source files (src/ outside src/experimental) do not mention the experimental tree at all", () => {
    const offenders = walk(join(ROOT, "src"))
      .map((file) => relative(ROOT, file))
      .filter((file) => !file.startsWith("src/experimental/"))
      .filter((file) => /experimental\/adaptive/.test(readFileSync(join(ROOT, file), "utf8")));
    assert.deepEqual(offenders, []);
  });
  it("only package.json scripts (not dependencies or bins) reference the experimental CLI", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string>; bin?: unknown; main?: unknown };
    const users = Object.entries(pkg.scripts).filter(([, command]) => /experimental/.test(command)).map(([name]) => name);
    // campaign:cli is the operator path of the experimental campaign (docs/experiments/campaign); same rule, named script only.
    assert.ok(users.every((name) => name.startsWith("adaptive:") || name === "campaign:cli"), `unexpected scripts: ${users.join(", ")}`);
    assert.equal(pkg.bin, undefined);
  });
});
