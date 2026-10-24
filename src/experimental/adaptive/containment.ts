// Experimental adaptive-assessment track (docs/experiments/ADAPTIVE_HARNESS.md). Not imported by production code.
// Network-level containment for the sandbox browser in fixture mode. Page-level controls (CDP Fetch, routeWebSocket, init scripts) only
// see traffic from pages they are attached to; a dedicated worker's WebSocket, for example, is invisible to them. Every request the
// browser makes therefore goes through this deny-by-default forward proxy: plain GET/HEAD to an allowed http origin is forwarded,
// everything else (other hosts, other methods, CONNECT tunnels, which is how Chrome carries ws:// through a proxy, and upgrades) is refused.
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import type { Browser } from "playwright";
import { launchSandboxBrowser } from "./policy.js";

export type ContainmentProxy = { url: string; refused: string[]; close(): Promise<void> };

export async function startContainmentProxy(allowedOrigins: string[]): Promise<ContainmentProxy> {
  const allowed = new Map<string, URL>();
  for (const origin of allowedOrigins) {
    const url = new URL(origin);
    if (url.protocol !== "http:") throw new Error(`containment proxy only forwards http origins, got ${url.protocol}`);
    allowed.set(url.host, url);
  }
  // Refusal entries are method + host + path only; never headers or bodies.
  const refused: string[] = [];
  const proxy = createServer((req, res) => {
    let target: URL;
    try { target = new URL(req.url ?? ""); } catch { refused.push(`${req.method} (unparseable)`); res.writeHead(400); res.end(); return; }
    const upstream = allowed.get(target.host);
    if (!upstream || target.protocol !== "http:" || (req.method !== "GET" && req.method !== "HEAD")) {
      refused.push(`${req.method} ${target.host}${target.pathname}`);
      res.writeHead(403, { "content-type": "text/plain" }); res.end("refused by containment proxy");
      return;
    }
    const forward = httpRequest({ host: upstream.hostname, port: upstream.port, path: target.pathname + target.search, method: req.method, headers: { ...req.headers, host: target.host, connection: "close" } }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    forward.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    forward.end();
  });
  proxy.on("connect", (req, socket) => { refused.push(`CONNECT ${req.url ?? ""}`); socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); });
  proxy.on("upgrade", (req, socket) => { refused.push(`UPGRADE ${req.url ?? ""}`); socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const { port } = proxy.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    refused,
    close: () => new Promise<void>((resolve) => { proxy.closeAllConnections(); proxy.close(() => resolve()); }),
  };
}

export type ContainedBrowser = { browser: Browser; proxy: ContainmentProxy; close(): Promise<void> };

// Sandbox browser whose only network path is a containment proxy for the given origins.
export async function launchContainedBrowser(allowedOrigins: string[]): Promise<ContainedBrowser> {
  const proxy = await startContainmentProxy(allowedOrigins);
  let browser: Browser;
  try { browser = await launchSandboxBrowser({ proxyServer: proxy.url }); } catch (error) { await proxy.close(); throw error; }
  return { browser, proxy, close: async () => { await browser.close().catch(() => undefined); await proxy.close(); } };
}
