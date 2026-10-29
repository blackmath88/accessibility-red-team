import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const SCRIPT = "scripts/basel_discovery_build.py";
const FIXTURE = "test/fixtures/basel-discovery-sample.json";

function build(...args: string[]) {
  return spawnSync("python3", ["-I", SCRIPT, ...args], { encoding: "utf8" });
}

test("basel discovery: committed index.html embeds the validated discovery-data.json", () => {
  const r = build("--check");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /embedded identically/);
});

test("basel discovery: sample fixture validates and embeds into a separate page", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "basel-discovery-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, "sample.html");
  const r = build("--data", FIXTURE, "--out", out);
  assert.equal(r.status, 0, r.stderr);
  const html = readFileSync(out, "utf8");
  const embedded = html.match(/<script type="application\/json" id="discovery-data">(.*?)<\/script>/s);
  assert.ok(embedded);
  assert.deepEqual(JSON.parse(embedded[1]), JSON.parse(readFileSync(FIXTURE, "utf8")));
});

test("basel discovery: an edge to an unknown id fails validation and names the edge", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "basel-discovery-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const data = JSON.parse(readFileSync(FIXTURE, "utf8"));
  data.edges[0].to = "wp-does-not-exist";
  const broken = join(dir, "broken.json");
  writeFileSync(broken, JSON.stringify(data));
  const r = build("--data", broken, "--out", join(dir, "broken.html"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /edge e-test-fiktiv: to 'wp-does-not-exist' does not resolve/);
});

test("basel discovery: assessment authorisation outside the two historical origins is rejected", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "basel-discovery-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const data = JSON.parse(readFileSync(FIXTURE, "utf8"));
  data.webProperties[0].assessmentAuthorized = true;
  const broken = join(dir, "broken.json");
  writeFileSync(broken, JSON.stringify(data));
  const r = build("--data", broken, "--out", join(dir, "broken.html"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /assessmentAuthorized true is only allowed/);
});
