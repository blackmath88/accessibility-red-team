// Experimental adaptive track (docs/experiments/ABC_LOCAL_HYBRID.md). Not imported by production code.
// Fresh-browser reproduction of selected seeded cases on the development fixtures, independent of any tester session:
// a new contained browser context per case, keyboard-only steps, a focus trace and genuine screenshots.
// With --repaired, the same steps run against a repaired copy of the page served through a request route (demonstration
// segment only; the fixture files themselves are not changed and no scored run uses the repaired copy).
//   npm run adaptive:abc-reproduce -- [--repaired] [--out runs/abc/repro]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Page } from "playwright";
import { launchContainedBrowser } from "./containment.js";
import { CONTEXT_OPTIONS } from "./policy.js";
import { FIXTURE_DIR, startFixtures } from "../../../test/fixtures/adaptive-sites/server.js";

type Step = { action: string; focus: { tag: string; id: string | null; name: string } | null; note?: string };
type Case = { id: string; path: string; repair?: { find: string; replace: string; why: string }; run(page: Page, shot: (name: string) => Promise<string>, steps: Step[]): Promise<Record<string, unknown>> };

const focusOf = (page: Page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: "body", id: null, name: "" };
  return { tag: el.tagName.toLowerCase(), id: el.id || null, name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 60) };
});

const CASES: Case[] = [
  {
    id: "dialog-focus-return", path: "/dev-k3/index.html",
    repair: { find: '["c3", "d3", "x3", false]', replace: '["c3", "d3", "x3", true]', why: "Escape on the second dialog returns focus to its trigger, as the first dialog already does" },
    async run(page, shot, steps) {
      const out: Record<string, unknown> = {};
      for (const [trigger, label] of [["c2", "first dialog (control)"], ["c3", "second dialog"]] as const) {
        await page.focus(`#${trigger}`);
        steps.push({ action: `focus #${trigger} (${label})`, focus: await focusOf(page) });
        await page.keyboard.press("Enter");
        await page.waitForTimeout(100);
        steps.push({ action: "Enter (open dialog)", focus: await focusOf(page) });
        if (trigger === "c3") out["screenshotOpen"] = await shot(`${trigger}-open`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(100);
        const after = await focusOf(page);
        steps.push({ action: "Escape (close dialog)", focus: after, note: after.id === trigger ? "focus returned to trigger" : "focus NOT returned to trigger" });
        if (trigger === "c3") out["screenshotAfterEscape"] = await shot(`${trigger}-after-escape`);
        out[trigger] = { focusAfterEscape: after, returned: after.id === trigger };
      }
      return out;
    },
  },
  {
    id: "skip-link-target", path: "/dev-k1/s/m2.html",
    repair: { find: 'href="#inhalt-x"', replace: 'href="#inhalt"', why: "the skip link points at the existing main element" },
    async run(page, shot, steps) {
      const href = await page.getAttribute("a.skip", "href");
      const target = await page.evaluate((h) => { const t = h ? document.getElementById(h.slice(1)) : null; return t ? { tag: t.tagName.toLowerCase(), id: t.id } : null; }, href);
      await page.keyboard.press("Tab");
      steps.push({ action: "Tab (first focusable)", focus: await focusOf(page) });
      const shotFocus = await shot("skip-focused");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);
      await page.keyboard.press("Tab");
      const next = await focusOf(page);
      steps.push({ action: "Enter on skip link, then Tab", focus: next, note: "where keyboard focus continues after using the skip link" });
      return { href, targetElement: target, targetExists: target !== null, nextFocusAfterSkip: next, screenshotFocused: shotFocus };
    },
  },
  {
    id: "icon-button-name", path: "/dev-k2/t/2.html",
    async run(page, shot, steps) {
      const header = page.locator("header");
      const aria = await header.ariaSnapshot();
      await page.focus("#b-s4");
      steps.push({ action: "focus #b-s4", focus: await focusOf(page) });
      const name = await page.evaluate(() => { const b = document.getElementById("b-s4")!; return { ariaLabel: b.getAttribute("aria-label"), title: b.getAttribute("title"), text: b.textContent?.trim() ?? "" }; });
      return { ariaSnapshotOfHeader: aria, nameSources: name, screenshotFocused: await shot("icon-button-focused") };
    },
  },
];

async function main() {
  const argv = process.argv.slice(2);
  const repaired = argv.includes("--repaired");
  const outIdx = argv.indexOf("--out");
  const dir = resolve(outIdx >= 0 ? argv[outIdx + 1]! : "runs/abc/repro", `${repaired ? "repaired" : "original"}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await mkdir(dir, { recursive: true });
  const server = await startFixtures();
  const contained = await launchContainedBrowser([server.origin]);
  const results: Record<string, unknown>[] = [];
  try {
    for (const item of CASES) {
      if (repaired && !item.repair) continue;
      const context = await contained.browser.newContext(CONTEXT_OPTIONS);
      const page = await context.newPage();
      if (repaired && item.repair) {
        const repair = item.repair;
        // The repaired copy is built from the fixture file on disk (route.fetch would go through the containment proxy, which
        // refuses it); the original file is never modified.
        const original = await readFile(join(FIXTURE_DIR, item.path), "utf8");
        const body = original.replace(repair.find, repair.replace);
        if (body === original) throw new Error(`repair for ${item.id} did not apply: "${repair.find}" not found`);
        await page.route(`${server.origin}${item.path}`, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body }));
      }
      await page.goto(`${server.origin}${item.path}`, { waitUntil: "domcontentloaded" });
      const steps: Step[] = [];
      const shot = async (name: string) => { const file = `${item.id}-${name}.png`; await page.screenshot({ path: join(dir, file) }); return file; };
      const observed = await item.run(page, shot, steps);
      results.push({ case: item.id, page: item.path, repaired, repair: repaired ? item.repair : null, steps, observed });
      await context.close();
    }
  } finally {
    await contained.close();
    await server.close();
  }
  await writeFile(join(dir, "repro.json"), JSON.stringify({ schema: "art/adaptive-abc-repro/v1", repaired, results }, null, 2));
  console.log(dir);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error); process.exit(1); });
