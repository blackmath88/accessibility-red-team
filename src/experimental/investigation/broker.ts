// Experimental investigation slice (ADR-0015). Nothing outside src/experimental/ imports this module.
//
// Read-only measurement broker: the only way generated probe code reaches a page. It exposes a FIXED list of reviewed
// operations; every argument is validated and passed to fixed page snippets as data (never concatenated into code).
// No raw Page, no arbitrary evaluate, no routing/request APIs, no clicks, typing, DOM writes or navigation chosen by the
// probe. Live loads are limited to one exact approved URL, counted in a persistent ledger (cap and minimum gap), with
// off-origin navigation, non-GET requests, downloads, popups and service workers refused.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type ElementHandle, type Page } from "playwright";
import sharp from "sharp";

export const BROKER_VERSION = "ail-broker/v1";
export const LIVE_URL = "https://www.bs.ch/apps/zonensuche";
const LIVE_ORIGIN = "https://www.bs.ch";
export const VIEWPORTS: Record<string, { width: number; height: number }> = { "1440x900": { width: 1440, height: 900 }, "1280x800": { width: 1280, height: 800 }, "390x844": { width: 390, height: 844 } };
const UA = "AccessibilityRedTeam/0.1 (+public accessibility research; read-only measurement)";
const RENDER_WAIT_MS = 3000;

export type BrokerOptions = { runDir: string; ledgerPath: string; fixtureDir: string; liveAllowed: boolean; maxLiveLoads: number; minGapMs: number };
type Reply = { ok: true; result: unknown } | { ok: false; reason: string };
type Ledger = { loads: Array<{ at: string; url: string; viewport: string; status: number | null; attempt: string }>; lastAt: number };

const str = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
const int = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

export class MeasurementBroker {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private handles = new Map<string, ElementHandle>();
  private artifactN = 0;
  readonly log: Array<{ at: string; attempt: string; op: string; ok: boolean; reason?: string }> = [];
  private attempt = "unset";
  private liveForAttempt = false;
  private liveOpens = 0;
  private lock: Promise<unknown> = Promise.resolve();

  constructor(private readonly o: BrokerOptions) {}

  // Live access is granted per attempt and only when that attempt's packet targets live; one live open per attempt.
  forAttempt(attempt: string, opts: { live: boolean } = { live: false }) {
    this.attempt = attempt; this.liveForAttempt = this.o.liveAllowed && opts.live; this.liveOpens = 0;
    return this.handle;
  }

  async close() { await this.context?.close().catch(() => undefined); await this.browser?.close().catch(() => undefined); }

  // A missing ledger starts empty; an unreadable or malformed one blocks live loads (fail closed).
  private async ledger(): Promise<Ledger> {
    const exists = await access(this.o.ledgerPath, constants.F_OK).then(() => true, () => false);
    if (!exists) return { loads: [], lastAt: 0 };
    const L = JSON.parse(await readFile(this.o.ledgerPath, "utf8")) as Ledger;
    if (!Array.isArray(L.loads) || typeof L.lastAt !== "number") throw new Error("live ledger malformed");
    return L;
  }

  // All operations are serialised inside the broker as well, whatever the caller does.
  readonly handle = (op: string, args: unknown, signal?: AbortSignal): Promise<Reply> => {
    const run = this.lock.then(() => this.handleNow(op, args, signal));
    this.lock = run.catch(() => undefined);
    return run;
  };

  private async handleNow(op: string, args: unknown, signal?: AbortSignal): Promise<Reply> {
    const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
    let reply: Reply;
    if (signal?.aborted) reply = { ok: false, reason: "attempt settled" };
    else try { reply = await this.dispatch(op, a, signal); } catch (error) { reply = { ok: false, reason: `operation failed: ${String((error as Error).message ?? error).slice(0, 160)}` }; }
    this.log.push({ at: new Date().toISOString(), attempt: this.attempt, op, ok: reply.ok, ...(reply.ok ? {} : { reason: reply.reason }) });
    return reply;
  }

  private async dispatch(op: string, a: Record<string, unknown>, signal?: AbortSignal): Promise<Reply> {
    switch (op) {
      case "open": return this.open(a, signal);
      case "viewport": return this.withPage((p) => p.evaluate(() => ({ innerWidth, innerHeight, devicePixelRatio, scrollX: Math.round(scrollX), scrollY: Math.round(scrollY), docHeight: document.documentElement.scrollHeight })));
      case "findText": {
        const text = str(a["text"], 80), max = int(a["max"] ?? 5, 1, 5);
        if (!text || !max) return { ok: false, reason: "findText needs text (1-80 chars) and max 1-5" };
        return this.withPage(async (p) => this.describe(await p.$$(`xpath=//*[contains(normalize-space(text()), ${xpathLiteral(text)})]`), max, "t"));
      }
      case "query": {
        const selector = str(a["selector"], 200), max = int(a["max"] ?? 5, 1, 10);
        if (!selector || !max) return { ok: false, reason: "query needs selector (1-200 chars) and max 1-10" };
        return this.withPage(async (p) => { try { return this.describe(await p.$$(selector), max, "q"); } catch { throw new Error("invalid selector"); } });
      }
      case "elementsFromPoint": {
        const pts = Array.isArray(a["points"]) ? a["points"] : null;
        if (!pts || pts.length === 0 || pts.length > 20) return { ok: false, reason: "points: 1-20 {x,y}" };
        const clean = pts.map((pt) => ({ x: int((pt as Record<string, unknown>)?.["x"], 0, 4000), y: int((pt as Record<string, unknown>)?.["y"], 0, 4000) }));
        if (clean.some((pt) => pt.x === null || pt.y === null)) return { ok: false, reason: "points need integer x,y in 0..4000" };
        return this.withPage((p) => p.evaluate(STACK_SNIPPET, clean as Array<{ x: number; y: number }>));
      }
      case "scrollTo": {
        const y = int(a["y"], 0, 20000);
        if (y === null) return { ok: false, reason: "scrollTo needs integer y 0..20000" };
        return this.withPage(async (p) => { await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(300); return p.evaluate(() => ({ scrollY: Math.round(scrollY) })); });
      }
      case "pixels": {
        const c = (a["clip"] ?? {}) as Record<string, unknown>;
        const clip = { x: int(c["x"], 0, 4000), y: int(c["y"], 0, 4000), width: int(c["width"], 1, 800), height: int(c["height"], 1, 300) };
        if (Object.values(clip).some((v) => v === null)) return { ok: false, reason: "clip needs integer x,y (0..4000), width 1..800, height 1..300 (viewport coordinates)" };
        return this.withPage(async (p) => this.pixels(p, clip as { x: number; y: number; width: number; height: number }));
      }
      case "screenshot": return this.withPage(async (p) => this.saveShot(await p.screenshot(), "viewport"));
      default: return { ok: false, reason: `unknown operation ${op.slice(0, 40)} (allowed: open, viewport, findText, query, elementsFromPoint, scrollTo, pixels, screenshot)` };
    }
  }

  private async withPage(fn: (p: Page) => Promise<unknown>): Promise<Reply> {
    if (!this.page) return { ok: false, reason: "no page open; call open first" };
    return { ok: true, result: await fn(this.page) };
  }

  private async open(a: Record<string, unknown>, signal?: AbortSignal): Promise<Reply> {
    const target = str(a["target"], 40), vpName = str(a["viewport"] ?? "1440x900", 10);
    const vp = vpName ? VIEWPORTS[vpName] : undefined;
    if (!target || !vp) return { ok: false, reason: `open needs target ("live" or a fixture name) and viewport in ${Object.keys(VIEWPORTS).join(", ")}` };
    let url: string;
    if (target === "live") {
      if (!this.liveForAttempt) return { ok: false, reason: "live target not enabled for this attempt" };
      if (this.liveOpens >= 1) return { ok: false, reason: "one live open per attempt" };
      const L = await this.ledger();
      if (L.loads.length >= this.o.maxLiveLoads) return { ok: false, reason: `live load cap ${this.o.maxLiveLoads} reached` };
      const wait = L.lastAt + this.o.minGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (signal?.aborted) return { ok: false, reason: "attempt settled before the live load" };
      this.liveOpens++;
      url = LIVE_URL;
    } else {
      if (!/^[a-z-]{1,30}$/.test(target)) return { ok: false, reason: "unknown fixture" };
      url = pathToFileURL(join(this.o.fixtureDir, `${target}.html`)).href;
    }
    await this.context?.close().catch(() => undefined);
    this.context = null; this.page = null;
    this.handles.clear();
    this.browser ??= await chromium.launch();
    this.context = await this.browser.newContext({ viewport: vp, userAgent: UA, acceptDownloads: false, serviceWorkers: "block", javaScriptEnabled: true });
    // tsx wraps named functions in the fixed snippets with a __name helper; define it in the page (a global, not a DOM change).
    await this.context.addInitScript("window.__name = (f) => f;");
    await this.context.route("**/*", (route) => {
      const req = route.request();
      if (req.method() !== "GET") return route.abort();
      if (req.isNavigationRequest() && req.frame() === main.mainFrame() && req.url().split("#")[0] !== url) return route.abort();
      if (target !== "live" && !req.url().startsWith("file://")) return route.abort();
      return route.continue();
    });
    const main = await this.context.newPage();
    this.page = main;
    this.context.on("page", (p) => { if (p !== main) void p.close(); }); // popups are closed, never followed
    let status: number | null = null;
    if (target === "live") {
      const L = await this.ledger();
      L.lastAt = Date.now();
      L.loads.push({ at: new Date().toISOString(), url, viewport: vpName!, status: null, attempt: this.attempt });
      await writeFile(this.o.ledgerPath, JSON.stringify(L, null, 1)); // counted before the request, so failures count too
      const res = await main.goto(url, { waitUntil: "load", timeout: 30_000 }).catch(() => null);
      status = res?.status() ?? null;
      L.loads[L.loads.length - 1]!.status = status;
      await writeFile(this.o.ledgerPath, JSON.stringify(L, null, 1));
    } else {
      await main.goto(url, { waitUntil: "load", timeout: 10_000 });
    }
    await main.waitForTimeout(target === "live" ? RENDER_WAIT_MS : 200);
    const landed = new URL(main.url());
    const expected = target === "live" ? landed.origin === LIVE_ORIGIN : landed.protocol === "file:";
    if (!expected) { await main.close().catch(() => undefined); this.page = null; this.handles.clear(); return { ok: false, reason: "landed off-origin; page closed" }; }
    return { ok: true, result: { target, url: target === "live" ? url : `fixture:${target}`, viewport: vpName, status } };
  }

  private async describe(els: ElementHandle[], max: number, prefix: string) {
    const out = [];
    for (const el of els.slice(0, max)) {
      const id = `${prefix}${this.handles.size + 1}`;
      this.handles.set(id, el);
      out.push({ handle: id, ...(await el.evaluate(DESCRIBE_SNIPPET)) });
    }
    return { count: els.length, returned: out.length, elements: out };
  }

  private async pixels(p: Page, clip: { x: number; y: number; width: number; height: number }) {
    const png = await p.screenshot({ clip });
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const grey: number[] = [];
    for (let i = 0; i < data.length; i += info.channels) grey.push(Math.round(0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!));
    const sorted = [...grey].sort((x, y) => x - y);
    const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]!;
    const hist = new Array(16).fill(0); for (const g of grey) hist[Math.min(15, g >> 4)]++;
    const art = await this.saveShot(png, "clip");
    return { clip, artifact: art, pixels: grey.length, min: sorted[0], p01: q(0.01), p05: q(0.05), p50: q(0.5), max: sorted[sorted.length - 1],
             below: { 100: grey.filter((g) => g < 100).length, 150: grey.filter((g) => g < 150).length, 200: grey.filter((g) => g < 200).length, 230: grey.filter((g) => g < 230).length },
             histogram16: hist };
  }

  private async saveShot(png: Buffer, kind: string) {
    await mkdir(join(this.o.runDir, "artifacts"), { recursive: true });
    const sha = createHash("sha256").update(png).digest("hex");
    const name = `${this.attempt}-${String(++this.artifactN).padStart(2, "0")}-${kind}.png`;
    await writeFile(join(this.o.runDir, "artifacts", name), png);
    return { id: name, sha256: sha };
  }
}

function xpathLiteral(s: string) { return s.includes("'") ? `concat('${s.split("'").join("', \"'\", '")}')` : `'${s}'`; }

// Fixed, reviewed page snippets. They receive only validated data and return bounded, page-derived strings.
const DESCRIBE_SNIPPET = (el: Element) => {
  const cut = (s: unknown, n: number) => String(s ?? "").slice(0, n);
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  let opacity = 1;
  const chain: Array<Record<string, string>> = [];
  for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    opacity *= Number(cs.opacity);
    if (cs.opacity !== "1" || cs.filter !== "none" || cs.mixBlendMode !== "normal") chain.push({ tag: n.tagName.toLowerCase(), cls: cut(n.className, 60), opacity: cs.opacity, filter: cut(cs.filter, 40), blend: cs.mixBlendMode });
  }
  return {
    tag: el.tagName.toLowerCase(), id: cut(el.id, 40), cls: cut(el.className, 80), text: cut(el.textContent?.trim(), 80),
    rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
    style: { color: s.color, backgroundColor: s.backgroundColor, opacity: s.opacity, position: s.position, zIndex: s.zIndex, visibility: s.visibility, display: s.display, fontSize: s.fontSize, fontWeight: s.fontWeight, top: s.top },
    effectiveOpacity: Math.round(opacity * 1000) / 1000, nonDefaultAncestors: chain.slice(0, 8),
  };
};
const STACK_SNIPPET = (points: Array<{ x: number; y: number }>) => points.map((pt) => ({
  point: pt,
  stack: document.elementsFromPoint(pt.x, pt.y).slice(0, 8).map((n) => {
    const cs = getComputedStyle(n); const r = n.getBoundingClientRect();
    return { tag: n.tagName.toLowerCase(), id: String(n.id).slice(0, 40), cls: String(n.className).slice(0, 80), text: String(n.textContent ?? "").trim().slice(0, 40),
             position: cs.position, zIndex: cs.zIndex, backgroundColor: cs.backgroundColor, opacity: cs.opacity, rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } };
  }),
}));
