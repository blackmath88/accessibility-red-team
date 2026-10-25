// Experimental adaptive-assessment track (docs/experiments/ADAPTIVE_HARNESS.md). Not imported by production code.
// Network-level containment for the sandbox browser in fixture mode. Page-level controls (CDP Fetch, routeWebSocket, init scripts) only
// see traffic from pages they are attached to; a dedicated worker's WebSocket, for example, is invisible to them. Every request the
// browser makes therefore goes through this deny-by-default forward proxy: plain GET/HEAD to an allowed http origin is forwarded,
// everything else (other hosts, other methods, CONNECT tunnels, which is how Chrome carries ws:// through a proxy, and upgrades) is refused.
import { createServer, request as httpRequest, type ClientRequest, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import type { Browser } from "playwright";
import { launchSandboxBrowser } from "./policy.js";

export type ContainmentProxy = { url: string; refused: string[]; refusedTotal(): number; close(): Promise<void> };

const MAX_REFUSAL_RECORDS = 200;
// Only end-to-end request headers a GET needs are forwarded: no hop-by-hop or proxy headers, and no body framing (no body is sent).
const FORWARDED_HEADERS = ["accept", "accept-language", "accept-encoding", "user-agent", "referer", "cache-control", "if-none-match", "if-modified-since", "range"];
// Response headers dropped on the way back: hop-by-hop, proxy and cookie headers (fixtures need no cookies, and a page must not be able
// to plant cookies for other hosts through the proxy).
const DROPPED_RESPONSE_HEADERS = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade", "set-cookie"]);

// Browsers launched through launchContainedBrowser. Session code refuses a caller-supplied browser that is not in this set.
const contained = new WeakSet<Browser>();
export const isContainedBrowser = (browser: Browser) => contained.has(browser);

export async function startContainmentProxy(allowedOrigins: string[]): Promise<ContainmentProxy> {
  const allowed = new Map<string, URL>();
  for (const origin of allowedOrigins) {
    const url = new URL(origin);
    if (url.protocol !== "http:") throw new Error(`containment proxy only forwards http origins, got ${url.protocol}`);
    allowed.set(url.host, url);
  }
  // Refusal entries are method + host + path only; never headers or bodies.
  const refusedEntries: string[] = [];
  let refusedCount = 0;
  const refused = { push: (entry: string) => { refusedCount += 1; if (refusedEntries.length < MAX_REFUSAL_RECORDS) refusedEntries.push(entry); } };
  const upstreams = new Set<ClientRequest>();
  const proxy = createServer((req, res) => {
    let target: URL;
    try { target = new URL(req.url ?? ""); } catch { refused.push(`${req.method} (unparseable)`); res.writeHead(400); res.end(); return; }
    const upstream = allowed.get(target.host);
    if (!upstream || target.protocol !== "http:" || (req.method !== "GET" && req.method !== "HEAD")) {
      refused.push(`${req.method} ${target.host}${target.pathname}`);
      res.writeHead(403, { "content-type": "text/plain" }); res.end("refused by containment proxy");
      return;
    }
    const forward = httpRequest({ host: upstream.hostname, port: upstream.port, path: target.pathname + target.search, method: req.method, headers: forwardedHeaders(req.headers, target.host), agent: false }, (up) => {
      res.writeHead(up.statusCode ?? 502, responseHeaders(up.headers));
      up.pipe(res);
      // A truncated upstream body must end the client response instead of leaving it open.
      up.on("aborted", () => res.destroy());
      up.on("error", () => res.destroy());
    });
    upstreams.add(forward);
    forward.on("close", () => upstreams.delete(forward));
    forward.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    res.on("close", () => forward.destroy());
    forward.end();
  });
  proxy.on("connect", (req, socket) => { refused.push(`CONNECT ${req.url ?? ""}`); socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); });
  proxy.on("upgrade", (req, socket) => { refused.push(`UPGRADE ${req.url ?? ""}`); socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const { port } = proxy.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    refused: refusedEntries,
    refusedTotal: () => refusedCount,
    close: () => new Promise<void>((resolve) => { for (const forward of upstreams) forward.destroy(); proxy.closeAllConnections(); proxy.close(() => resolve()); }),
  };
}

function responseHeaders(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const named = new Set(String(headers.connection ?? "").toLowerCase().split(",").map((name) => name.trim()).filter(Boolean));
  const out: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) if (value !== undefined && !DROPPED_RESPONSE_HEADERS.has(name) && !named.has(name)) out[name] = value;
  return out;
}

function forwardedHeaders(headers: IncomingHttpHeaders, host: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = { host, connection: "close" };
  for (const name of FORWARDED_HEADERS) { const value = headers[name]; if (value !== undefined) out[name] = value; }
  return out;
}

export type ContainedBrowser = { browser: Browser; proxy: ContainmentProxy; close(): Promise<void> };

// Sandbox browser whose only network path is a containment proxy for the given origins.
export async function launchContainedBrowser(allowedOrigins: string[]): Promise<ContainedBrowser> {
  const proxy = await startContainmentProxy(allowedOrigins);
  let browser: Browser;
  try { browser = await launchSandboxBrowser({ proxyServer: proxy.url }); } catch (error) { await proxy.close(); throw error; }
  contained.add(browser);
  return { browser, proxy, close: async () => { await browser.close().catch(() => undefined); await proxy.close(); } };
}
