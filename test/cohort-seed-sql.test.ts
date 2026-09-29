import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canonicalSeedUrl, cohortSeedSql, operatorSeedSql } from "../src/cohort/seed-sql.js";

const now = "2026-09-29T00:00:00.000Z";

test("Wave 1 seed contains exactly the eight approved municipalities", async () => {
  const yaml = await readFile(new URL("../evaluation/cohorts/zh-so-pilot-v1-wave1.yml", import.meta.url), "utf8");
  const result = cohortSeedSql(yaml, { caseSuffix: "wave1", now });
  assert.deepEqual(result.sites.map((site) => site.name), ["Zürich", "Uster", "Bauma", "Volken", "Solothurn", "Zuchwil", "Messen", "Welschenrohr-Gänsbrunnen"]);
  assert.equal(result.sql.match(/INSERT OR IGNORE INTO assessment_cases/g)?.length, 8);
  assert.doesNotMatch(result.sql, /operators|runs/);
});

test("seed URLs must be public https DNS names", () => {
  assert.equal(canonicalSeedUrl("https://www.uster.ch/#top").toString(), "https://www.uster.ch/");
  for (const bad of ["http://www.uster.ch/", "https://100.64.0.1/", "https://user:pw@www.uster.ch/", "https://localhost/", "https://nas.local/", "https://intranet/", "https://www.uster.ch:8443/"]) {
    assert.throws(() => canonicalSeedUrl(bad), Error, bad);
  }
});

test("seed SQL escapes values and rejects duplicate sites", () => {
  const yaml = `id: t\nsites:\n  - { id: ch-x-a, name: "O'Brien", canton: ZH, url: "https://a.example.ch/" }\n`;
  assert.match(cohortSeedSql(yaml, { caseSuffix: "t", now }).sql, /'O''Brien'/);
  const dup = `id: t\nsites:\n  - { id: ch-x-a, name: A, canton: ZH, url: "https://a.example.ch/" }\n  - { id: ch-x-a, name: B, canton: ZH, url: "https://b.example.ch/" }\n`;
  assert.throws(() => cohortSeedSql(dup, { caseSuffix: "t", now }), /Duplicate/);
});

test("operator seed grants read/execute but never outreach", () => {
  const sql = operatorSeedSql({ email: " Person@Example.org ", displayName: "Person", now });
  assert.match(sql, /'person@example\.org', 'Person', 1, 1, 0, 1/);
  assert.throws(() => operatorSeedSql({ email: "x'); DROP TABLE runs; --@a.b", displayName: "x", now }));
  assert.throws(() => operatorSeedSql({ email: "", displayName: "x", now }));
});
