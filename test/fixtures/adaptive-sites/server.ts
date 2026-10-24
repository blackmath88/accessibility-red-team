// Tiny localhost fixture server for the experimental adaptive track. Binds 127.0.0.1 on random ports only.
// Two servers: the fixture origin and an "off" origin that must never be reached; every request to either is recorded.
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_NAMES = ["news-service", "menu-dialog", "skip-links", "repeated-component", "malicious", "heldout-menus"] as const;
export type FixtureName = typeof FIXTURE_NAMES[number];
// Fixtures used while developing the observer heuristics. "heldout-menus" is deliberately excluded.
export const DEVELOPMENT_FIXTURES: FixtureName[] = ["news-service", "menu-dialog", "skip-links", "repeated-component", "malicious"];

export type Truth = {
  fixture: string; heldOut?: boolean; startPath: string; surfaces: string[]; hiddenSurfaces: string[]; hiddenReason?: string; states: string[];
  defects: Array<{ id: string; category: string; path: string; match: string; repeatedAcross?: number; note: string }>;
  detectorTraps: Array<{ id: string; path: string; match: string; note: string }>;
  injection?: { text: string; offPaths: string[] };
  // Expected classification of aria-controls / aria-haspopup triggers by element id (menu-vs-dialog fixtures only).
  controls?: Record<string, "dialog_trigger" | "disclosure_menu" | "unknown_target">;
  forbidden: { offOriginHits: number; nonGetHits: number };
};

export async function loadTruth(name: FixtureName): Promise<Truth> {
  return JSON.parse(await readFile(join(FIXTURE_DIR, name, "truth.json"), "utf8")) as Truth;
}

export type RecordedRequest = { method: string; path: string };

export type Fixtures = {
  // Origins as the browser should be told to use them.
  origin: string;
  offOrigin: string;
  hits: RecordedRequest[];
  offHits: RecordedRequest[];
  close(): Promise<void>;
};

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}

const closeServer = (server: Server) => new Promise<void>((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); });

// `publicHost` / `offPublicHost` only change how origins are spelled; both servers still listen on 127.0.0.1.
export async function startFixtures(options: { publicHost?: string; offPublicHost?: string } = {}): Promise<Fixtures> {
  const publicHost = options.publicHost ?? "127.0.0.1";
  const offPublicHost = options.offPublicHost ?? "127.0.0.1";
  const hits: RecordedRequest[] = [];
  const offHits: RecordedRequest[] = [];
  let origin = "";
  let offOrigin = "";

  const off = createServer((req, res) => {
    offHits.push({ method: req.method ?? "GET", path: req.url ?? "/" });
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><html lang=\"en\"><title>OFF-ORIGIN</title><h1>Off-origin page</h1></html>");
  });

  const main = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://fixture.invalid");
    hits.push({ method, path: url.pathname });
    if (method !== "GET" && method !== "HEAD") { res.writeHead(200, { "content-type": "text/plain" }); res.end("recorded"); return; }
    if (url.pathname === "/malicious/redirect-offsite") { res.writeHead(302, { location: `${offOrigin}/landed-by-redirect.html` }); res.end(); return; }
    if (url.pathname === "/malicious/file.bin") {
      res.writeHead(200, { "content-type": "application/octet-stream", "content-disposition": "attachment; filename=file.bin" });
      res.end(Buffer.from("binary"));
      return;
    }
    const relative = normalize(url.pathname).replace(/^\/+/, "");
    if (relative.includes("..") || !relative.endsWith(".html")) { res.writeHead(404); res.end("not found"); return; }
    try {
      const html = (await readFile(join(FIXTURE_DIR, relative), "utf8")).replaceAll("{{OFF}}", offOrigin);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(404); res.end("not found");
    }
  });

  const mainPort = await listen(main);
  const offPort = await listen(off);
  origin = `http://${publicHost}:${mainPort}`;
  offOrigin = `http://${offPublicHost}:${offPort}`;
  return {
    origin, offOrigin, hits, offHits,
    close: async () => { await closeServer(main); await closeServer(off); },
  };
}

// A forward proxy that exposes the loopback fixture server under a public-looking IP literal so that the unmodified production
// scanner and journeys (which call validatePublicTarget and refuse loopback) can run against it. Anything except the one mapped
// host:port is refused and recorded; this is the containment for the baseline arm, which has no browser policy of its own.
export type FixtureProxy = { url: string; refused: string[]; close(): Promise<void> };

export async function startFixtureProxy(map: Record<string, { port: number }>): Promise<FixtureProxy> {
  const refused: string[] = [];
  const proxy = createServer((req, res) => {
    let target: URL;
    try { target = new URL(req.url ?? ""); } catch { res.writeHead(400); res.end(); return; }
    const mapped = map[target.host];
    if (!mapped || req.method !== "GET") {
      refused.push(`${req.method} ${target.host}${target.pathname}`);
      res.writeHead(403, { "content-type": "text/plain" }); res.end("refused by fixture proxy");
      return;
    }
    const upstream = httpRequest({ host: "127.0.0.1", port: mapped.port, path: target.pathname + target.search, method: "GET", headers: { accept: String(req.headers.accept ?? "*/*") } }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502); res.end(); });
    upstream.end();
  });
  proxy.on("connect", (_req, socket) => { refused.push("CONNECT"); socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); });
  const port = await listen(proxy);
  return { url: `http://127.0.0.1:${port}`, refused, close: () => closeServer(proxy) };
}

export function portOf(origin: string): number {
  return Number(new URL(origin).port);
}
