import { readFile, writeFile } from "node:fs/promises";
import { cohortSeedSql, operatorSeedSql } from "../../src/cohort/seed-sql.js";

// Usage:
//   tsx scripts/cloudflare/seed-sql.ts cohort <cohort.yml> <case-suffix> <out.sql>
//   OPERATOR_EMAIL=... OPERATOR_NAME=... tsx scripts/cloudflare/seed-sql.ts operator <out.sql>
// The operator identity comes from the environment (a GitHub environment variable in CI), never the repository.
const [mode, ...rest] = process.argv.slice(2);
const now = new Date().toISOString();
if (mode === "cohort") {
  const [path, suffix, out] = rest;
  if (!path || !suffix || !out) throw new Error("usage: cohort <cohort.yml> <case-suffix> <out.sql>");
  const result = cohortSeedSql(await readFile(path, "utf8"), { caseSuffix: suffix, now });
  await writeFile(out, result.sql);
  console.log(JSON.stringify({ cohort: result.cohortId, sites: result.sites.map((site) => site.id) }));
} else if (mode === "operator") {
  const [out] = rest;
  if (!out) throw new Error("usage: operator <out.sql>");
  await writeFile(out, operatorSeedSql({ email: process.env.OPERATOR_EMAIL ?? "", displayName: process.env.OPERATOR_NAME ?? "Operator", now }));
  console.log(JSON.stringify({ operatorSeed: "written" }));
} else {
  throw new Error("mode must be cohort or operator");
}
