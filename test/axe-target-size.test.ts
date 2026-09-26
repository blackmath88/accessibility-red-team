import assert from "node:assert/strict";
import test from "node:test";
import { AxeBuilder } from "@axe-core/playwright";
import { chromium } from "playwright";

test("axe 4.13 target-size is absent by default and observable when explicitly enabled", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  t.after(async () => context.close());
  const page = await context.newPage();
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head>
        <style>
          a.tiny {
            display: inline-block;
            width: 10px;
            height: 10px;
            line-height: 10px;
          }
        </style>
      </head>
      <body>
        <a class="tiny" href="#destination" aria-label="Tiny target">x</a>
        <div id="destination">Destination</div>
      </body>
    </html>
  `);

  const defaultRun = await new AxeBuilder({ page }).analyze();
  const explicitRun = await new AxeBuilder({ page })
    .withRules(["target-size"])
    .analyze();

  const defaultRuleIds = new Set([
    ...defaultRun.violations,
    ...defaultRun.incomplete,
    ...defaultRun.passes,
    ...defaultRun.inapplicable,
  ].map((result) => result.id));

  const explicitResults = [
    ...explicitRun.violations,
    ...explicitRun.incomplete,
    ...explicitRun.passes,
    ...explicitRun.inapplicable,
  ];
  const targetSize = explicitResults.find((result) => result.id === "target-size");

  assert.equal(defaultRuleIds.has("target-size"), false);
  assert.ok(targetSize, "explicit target-size run should return a target-size result");
  assert.equal(targetSize.tags.includes("wcag258"), true);
  assert.equal(targetSize.tags.includes("wcag22aa"), true);
  assert.notEqual(targetSize.nodes.length, 0);
});


test("target-size fixture matrix captures spacing-sensitive fail and clear pass", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  t.after(async () => context.close());

  async function outcomeFor(html: string) {
    const page = await context.newPage();
    await page.setContent(html);
    const run = await new AxeBuilder({ page }).withRules(["target-size"]).analyze();
    await page.close();
    if (run.violations.some((r) => r.id === "target-size")) return "violation";
    if (run.incomplete.some((r) => r.id === "target-size")) return "incomplete";
    if (run.passes.some((r) => r.id === "target-size")) return "pass";
    if (run.inapplicable.some((r) => r.id === "target-size")) return "inapplicable";
    return "missing";
  }

  const crowdedTinyTargets = `
    <!doctype html><html lang="en"><head><style>
      a.target { display:inline-block; width:10px; height:10px; line-height:10px; margin:0; padding:0; }
    </style></head><body>
      <a class="target" href="#a" aria-label="Target A">a</a><a class="target" href="#b" aria-label="Target B">b</a>
      <div id="a">A</div><div id="b">B</div>
    </body></html>
  `;

  const largeTarget = `
    <!doctype html><html lang="en"><head><style>
      a.target { display:inline-block; width:44px; height:44px; line-height:44px; }
    </style></head><body>
      <a class="target" href="#a" aria-label="Target A">a</a><div id="a">A</div>
    </body></html>
  `;

  assert.equal(await outcomeFor(crowdedTinyTargets), "violation");
  assert.equal(await outcomeFor(largeTarget), "pass");
});
