import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { triageSurfaceRuns } from "../src/triage/triage.js";

test("groups the same probe across surfaces into one finding", async () => {
  const root = join(tmpdir(), "art-triage-" + randomUUID());
  const a = join(root, "a");
  const b = join(root, "b");
  await mkdir(a, { recursive: true });
  await mkdir(b, { recursive: true });

  const probe = {
    schema: "art/probe-result/v1",
    probeId: "axe.label",
    probeVersion: "axe-core/4.13",
    surfaceId: "x",
    stateId: "initial",
    outcome: "violation",
    impact: "serious",
    help: "Form elements must have labels",
    helpUrl: "https://example.com/help",
    tags: ["wcag2a", "wcag412"],
    requirements: [{ framework: "WCAG", criterion: "4.1.2", sourceTag: "wcag412" }],
    nodes: [{ target: ["#email"], html: "<input id=\"email\">", failureSummary: "Fix label" }],
  };

  await writeFile(join(a, "probe-results.json"), JSON.stringify([probe]));
  await writeFile(join(b, "probe-results.json"), JSON.stringify([{ ...probe, nodes: [{ ...probe.nodes[0], target: ["#name"] }] }]));

  const out = join(root, "findings.json");
  const result = await triageSurfaceRuns([
    { surfaceId: "a", url: "https://example.com/a", runDir: a },
    { surfaceId: "b", url: "https://example.com/b", runDir: b },
  ], out);

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]!.affectedSurfaces, 2);
  assert.equal(result.findings[0]!.occurrenceCount, 2);
  assert.equal(result.findings[0]!.templateLeverage, "repeated");
  assert.equal(JSON.parse(await readFile(out, "utf8")).schema, "art/triage-result/v1");
});
