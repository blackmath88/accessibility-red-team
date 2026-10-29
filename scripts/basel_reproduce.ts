// Fresh-browser reproduction of selected Basel field observations (docs/experiments/BASEL_FIELD_HANDOFF.md).
// Public-safe: only already-assessed pages on the two authorised origins, one fresh context per case, GET navigation
// only, keyboard Tab and DOM/attribute reads only (no typing, no Enter, no clicks, no form interaction), at least 10 s
// between navigations, same user agent and viewport as the production scanner. Writes repro.json + screenshots.
//   npx tsx scripts/basel_reproduce.ts <out_dir>
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const ALLOWED = ["https://www.bs.ch/", "https://eportal.egov.bs.ch/"];
const VIEWPORT = { width: 1440, height: 900 };
const UA = "AccessibilityRedTeam/0.1 (+public accessibility research)";
const GAP_MS = 10_000;

const focusInfo = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return { tag: "body" };
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  let banner: string | null = null;
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const label = n.getAttribute("aria-label") || n.id || "";
    if (/cookie|consent/i.test(label + " " + n.className)) { banner = (n.getAttribute("aria-label") || n.id || n.tagName).slice(0, 60); break; }
  }
  return {
    tag: el.tagName.toLowerCase(), text: (el.textContent || "").trim().slice(0, 60), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth, scrollY: Math.round(scrollY),
    outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, focusVisible: el.matches(":focus-visible"), insideConsentBanner: banner,
  };
});

type Case = { id: string; url: string; run(page: Page, dir: string): Promise<Record<string, unknown>> };
const CASES: Case[] = [
  {
    id: "keyboard-first-tabs", url: "https://www.bs.ch/themen/persoenliches-und-wohnen/umzug-und-wegzug/umzug-innerhalb-des-kantons-melden",
    async run(page, dir) {
      const steps = [];
      await page.screenshot({ path: join(dir, "keyboard-0-loaded.png") });
      for (let i = 1; i <= 4; i += 1) {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(150);
        steps.push({ press: `Tab ${i}`, focus: await focusInfo(page) });
        await page.screenshot({ path: join(dir, `keyboard-${i}.png`) });
      }
      return { steps };
    },
  },
  {
    id: "search-field-semantics", url: "https://www.bs.ch/themen/persoenliches-und-wohnen/umzug-und-wegzug/umzug-innerhalb-des-kantons-melden",
    async run(page) {
      const attrs = await page.evaluate(() => {
        const el = document.getElementById("searchinput");
        if (!el) return null;
        const out: Record<string, string> = {};
        for (const a of Array.from(el.attributes)) if (a.name.startsWith("aria-") || ["type", "role", "id", "name"].includes(a.name)) out[a.name] = a.value;
        const controls = el.getAttribute("aria-controls");
        return { attributes: out, controlledElementExists: controls ? Boolean(document.getElementById(controls)) : null };
      });
      const snapshot = await page.locator("#searchinput").ariaSnapshot().catch(() => null);
      return { attributes: attrs, ariaSnapshot: snapshot };
    },
  },
  {
    id: "required-hint-contrast", url: "https://www.bs.ch/apps/zonensuche",
    async run(page, dir) {
      const info = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll(".text-xs")).find((n) => /muss ausgefüllt/.test(n.textContent || "")) as HTMLElement | undefined;
        if (!el) return null;
        const s = getComputedStyle(el);
        const lum = (c: string) => { const [r, g, b] = (c.match(/\d+/g) || []).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
        let bg = "rgb(255, 255, 255)";
        for (let n: HTMLElement | null = el; n; n = n.parentElement) { const b = getComputedStyle(n).backgroundColor; if (b && !b.startsWith("rgba(0, 0, 0, 0)") && b !== "transparent") { bg = b; break; } }
        const [l1, l2] = [lum(s.color), lum(bg)].sort((a, b) => b - a);
        el.scrollIntoView({ block: "center" });
        return { text: el.textContent?.trim(), color: s.color, background: bg, fontSize: s.fontSize, fontWeight: s.fontWeight, contrast: Math.round(((l1! + 0.05) / (l2! + 0.05)) * 100) / 100 };
      });
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(dir, "contrast-hint.png") });
      return { element: info, requiredRatio: 4.5 };
    },
  },
];

async function main() {
  const out = process.argv[2]!;
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  let last = 0;
  try {
    for (const item of CASES) {
      if (!ALLOWED.some((origin) => item.url.startsWith(origin))) throw new Error(`not an authorised origin: ${item.url}`);
      const wait = last + GAP_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      last = Date.now();
      const dir = join(out, item.id);
      await mkdir(dir, { recursive: true });
      const context = await browser.newContext({ viewport: VIEWPORT, userAgent: UA });
      // tsx/esbuild wraps named functions with a __name helper that does not exist in the page; define it there.
      await context.addInitScript("window.__name = (f) => f;");
      const page = await context.newPage();
      const at = new Date().toISOString();
      const response = await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(1000);
      const observed = await item.run(page, dir);
      results.push({ case: item.id, url: item.url, finalUrl: page.url(), status: response?.status() ?? null, at, browser: `chromium ${browser.version()}`, viewport: VIEWPORT, observed });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  await writeFile(join(out, "repro.json"), JSON.stringify({ schema: "art/basel-repro/v1", results }, null, 2));
  console.log(out);
}

main().catch((error) => { console.error(error); process.exit(1); });
