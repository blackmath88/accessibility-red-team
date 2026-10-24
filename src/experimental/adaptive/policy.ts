// Deterministic enforcement for the adaptive harness. Everything here runs in ordinary code OUTSIDE the prompt:
// the skill text is guidance, this module is the boundary.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { isPublicIp } from "../../scope.js";
import { isSafeActivationTarget } from "../../journeys/safety.js";
import { normalizeUrl } from "../../scout/links.js";
import type { DenialReason, SessionConfig } from "./contracts.js";

export type Decision = { allow: true } | { allow: false; reason: DenialReason; detail: string };
export type Resolver = (host: string) => Promise<string[]>;

export const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

const METADATA_HOSTS = new Set(["metadata", "metadata.google.internal", "instance-data", "169.254.169.254", "[fd00:ec2::254]", "fd00:ec2::254"]);
const deny = (reason: DenialReason, detail: string): Decision => ({ allow: false, reason, detail });
const ALLOW: Decision = { allow: true };

export type RequestFacts = { url: string; method: string; resourceType: string; isRedirectTarget?: boolean };
export type ResponseFacts = { url: string; status: number; headers: Record<string, string>; resourceType: string };

function bareHost(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

export class SessionPolicy {
  private readonly allowedOrigins: Set<string>;
  private readonly resolved = new Map<string, Promise<Decision>>();
  private bytes = 0;

  constructor(readonly config: SessionConfig, private readonly resolver: Resolver = defaultResolver) {
    this.allowedOrigins = new Set(config.allowedOrigins);
  }

  get responseBytes(): number { return this.bytes; }
  get bytesExceeded(): boolean { return this.bytes > this.config.limits.maxResponseBytes; }
  addBytes(n: number): void { if (Number.isFinite(n) && n > 0) this.bytes += n; }

  isAllowedOrigin(url: string): boolean {
    try { return this.allowedOrigins.has(new URL(url).origin); } catch { return false; }
  }

  // In public mode: literal private/loopback/link-local/metadata destinations and hostnames resolving to them are refused.
  // DNS is resolved by this process, not by the browser, so DNS rebinding between check and use is a known residual risk.
  private async destination(url: URL): Promise<Decision> {
    if (this.config.mode !== "public") return ALLOW;
    const host = bareHost(url);
    if (METADATA_HOSTS.has(host) || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return deny("private_destination", `internal or metadata host ${host}`);
    if (isIP(host)) return isPublicIp(host) ? ALLOW : deny("private_destination", `non-public address ${host}`);
    let pending = this.resolved.get(host);
    if (!pending) {
      pending = this.resolver(host).then((addresses) => {
        if (!addresses.length) return deny("private_destination", `${host} did not resolve`);
        const bad = addresses.find((address) => !isPublicIp(address));
        return bad ? deny("private_destination", `${host} resolves to non-public address ${bad}`) : ALLOW;
      }).catch(() => deny("private_destination", `${host} could not be resolved`));
      this.resolved.set(host, pending);
    }
    return pending;
  }

  // Applies to model-chosen navigations, redirects, popups and frame documents alike.
  async checkNavigationTarget(input: string, isRedirect = false): Promise<Decision> {
    let url: URL;
    try { url = new URL(input); } catch { return deny("scheme_not_allowed", "unparseable URL"); }
    if (url.protocol !== "http:" && url.protocol !== "https:") return deny("scheme_not_allowed", `scheme ${url.protocol} is not allowed`);
    if (url.username || url.password) return deny("origin_not_allowed", "URLs with credentials are not allowed");
    const destination = await this.destination(url);
    if (!destination.allow) return destination;
    if (!this.isAllowedOrigin(url.toString())) return deny(isRedirect ? "redirect_off_allowlist" : "origin_not_allowed", `${url.origin} is not in the origin allowlist`);
    return ALLOW;
  }

  async decideRequest(facts: RequestFacts): Promise<Decision> {
    if (this.bytesExceeded) return deny("response_too_large", `cumulative response bytes exceeded ${this.config.limits.maxResponseBytes}`);
    let url: URL;
    try { url = new URL(facts.url); } catch { return deny("scheme_not_allowed", "unparseable request URL"); }
    const document = facts.resourceType === "Document";
    if (url.protocol === "data:" || url.protocol === "blob:" || url.protocol === "about:") {
      return document && facts.url !== "about:blank" ? deny("scheme_not_allowed", `${url.protocol} documents are not allowed`) : ALLOW;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return deny("scheme_not_allowed", `scheme ${url.protocol} is not allowed`);
    if (url.username || url.password) return deny("origin_not_allowed", "URLs with credentials are not allowed");
    const method = facts.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") return deny("non_get_request", `${method} ${url.origin}${url.pathname} is not allowed`);
    const destination = await this.destination(url);
    if (!destination.allow) return destination;
    if (this.isAllowedOrigin(facts.url)) return ALLOW;
    if (document) return deny(facts.isRedirectTarget ? "redirect_off_allowlist" : "origin_not_allowed", `document request to ${url.origin} is off the allowlist`);
    // Fixture mode is closed: nothing off the allowlist may be fetched. Public mode lets public third-party subresources through.
    return this.config.mode === "fixture" ? deny("subrequest_off_allowlist", `${facts.resourceType} request to ${url.origin} is off the allowlist`) : ALLOW;
  }

  async decideResponse(facts: ResponseFacts): Promise<Decision> {
    if (facts.status >= 300 && facts.status < 400) {
      const location = facts.headers["location"];
      if (location) {
        let target: string;
        try { target = new URL(location, facts.url).toString(); } catch { return deny("redirect_off_allowlist", "unparseable redirect location"); }
        const document = facts.resourceType === "Document";
        const decision = document ? await this.checkNavigationTarget(target, true) : await this.decideRequest({ url: target, method: "GET", resourceType: facts.resourceType, isRedirectTarget: true });
        if (!decision.allow) return decision.reason === "origin_not_allowed" || decision.reason === "subrequest_off_allowlist" ? deny("redirect_off_allowlist", decision.detail) : decision;
      }
    }
    if (/attachment/i.test(facts.headers["content-disposition"] ?? "")) return deny("download_blocked", "response carries Content-Disposition: attachment");
    const length = Number(facts.headers["content-length"]);
    if (Number.isFinite(length) && this.bytes + length > this.config.limits.maxResponseBytes) return deny("response_too_large", `content-length ${length} would exceed maxResponseBytes`);
    return ALLOW;
  }

  normalize(url: string): string {
    try { return normalizeUrl(url); } catch { return url; }
  }
}

// ---------------------------------------------------------------- browser guard

export type RecordDenial = (input: { source: "executor_validation" | "browser_policy"; reason: DenialReason; detail: string; url: string | null; attemptedAction?: Record<string, unknown> | null }) => void;

const INIT_SCRIPT = `(() => {
  const report = (kind, detail) => { try { window.__artPolicy(kind, String(detail).slice(0, 300)); } catch (e) {} };
  window.open = function (url) { report("popup", url); return null; };
  document.addEventListener("submit", (event) => { event.preventDefault(); event.stopImmediatePropagation(); report("form_submit", event.target && event.target.action); }, true);
  HTMLFormElement.prototype.submit = function () { report("form_submit", this.action); };
  HTMLFormElement.prototype.requestSubmit = function () { report("form_submit", this.action); };
  // Defence in depth: the sandbox browser is launched without the SharedWorker feature at all (see launchSandboxBrowser). Page request
  // interception does not cover SharedWorker traffic, so the constructor must not exist; this stub covers a browser launched elsewhere.
  Object.defineProperty(window, "SharedWorker", { value: function SharedWorker() { report("shared_worker", ""); throw new DOMException("SharedWorker is disabled", "SecurityError"); }, configurable: false, writable: false });
})();`;

type FetchPaused = {
  requestId: string;
  request: { url: string; method: string };
  resourceType: string;
  redirectedRequestId?: string;
  responseStatusCode?: number;
  responseErrorReason?: string;
  responseHeaders?: Array<{ name: string; value: string }>;
};

export class BrowserGuard {
  private readonly guarded = new WeakSet<Page>();
  private readonly ours = new WeakSet<Page>();
  private opening = false;

  constructor(private readonly context: BrowserContext, private readonly policy: SessionPolicy, private readonly record: RecordDenial) {}

  async install(): Promise<void> {
    await this.context.exposeBinding("__artPolicy", (_source, kind: unknown, detail: unknown) => {
      if (kind === "popup") this.record({ source: "browser_policy", reason: "popup_blocked", detail: `window.open(${String(detail)}) was neutralised`, url: null });
      else if (kind === "shared_worker") this.record({ source: "browser_policy", reason: "worker_blocked", detail: "SharedWorker construction was refused", url: null });
      else if (kind === "form_submit") this.record({ source: "browser_policy", reason: "form_submit_blocked", detail: `form submission to ${String(detail)} was neutralised`, url: null });
    });
    await this.context.addInitScript(INIT_SCRIPT);
    // WebSockets are not interceptable through Fetch, so they are refused outright: deny-all, and never connected to the real server.
    await this.context.routeWebSocket(() => true, (ws) => {
      this.record({ source: "browser_policy", reason: "websocket", detail: "a WebSocket connection was refused", url: null });
      void ws.close({ code: 1008, reason: "refused by harness" }).catch(() => undefined);
    });
    this.context.on("page", (page) => {
      if (this.opening || this.ours.has(page)) return;
      this.record({ source: "browser_policy", reason: "popup_blocked", detail: "a new page/window was opened and closed", url: null });
      void page.close().catch(() => undefined);
    });
  }

  async openPage(): Promise<Page> {
    // The "page" event fires while newPage() is still pending, so the flag keeps the popup handler from closing our own page.
    this.opening = true;
    let page: Page;
    try { page = await this.context.newPage(); } finally { this.opening = false; }
    this.ours.add(page);
    await this.attach(page);
    return page;
  }

  private async attach(page: Page): Promise<void> {
    if (this.guarded.has(page)) return;
    this.guarded.add(page);
    const cdp = await this.context.newCDPSession(page);
    const handle = async (event: FetchPaused) => {
      const isResponse = event.responseStatusCode !== undefined || event.responseErrorReason !== undefined;
      let decision: Decision;
      if (isResponse) {
        const headers: Record<string, string> = {};
        for (const header of event.responseHeaders ?? []) headers[header.name.toLowerCase()] = header.value;
        decision = await this.policy.decideResponse({ url: event.request.url, status: event.responseStatusCode ?? 0, headers, resourceType: event.resourceType });
      } else {
        decision = await this.policy.decideRequest({ url: event.request.url, method: event.request.method, resourceType: event.resourceType, isRedirectTarget: Boolean(event.redirectedRequestId) });
      }
      if (decision.allow) {
        await cdp.send("Fetch.continueRequest", { requestId: event.requestId });
        return;
      }
      this.record({ source: "browser_policy", reason: decision.reason, detail: decision.detail, url: event.request.url });
      await cdp.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" });
    };
    cdp.on("Fetch.requestPaused", (event: FetchPaused) => {
      handle(event).catch(async () => {
        // Fail closed: if the policy itself errors, the request does not go out.
        await cdp.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" }).catch(() => undefined);
      });
    });
    cdp.on("Network.loadingFinished", (event: { encodedDataLength: number }) => this.policy.addBytes(event.encodedDataLength));
    await cdp.send("Network.enable");
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }, { urlPattern: "*", requestStage: "Response" }] });
    page.on("download", (download) => {
      this.record({ source: "browser_policy", reason: "download_blocked", detail: `download of ${download.url()} was cancelled`, url: download.url() });
      void download.cancel().catch(() => undefined);
    });
    page.on("filechooser", () => this.record({ source: "browser_policy", reason: "file_chooser_blocked", detail: "a file chooser was opened and not answered", url: page.url() }));
    page.on("dialog", (dialog) => { void dialog.dismiss().catch(() => undefined); });
  }
}

// Disposable browser: no profile, no connected session. Fixture hosts can be mapped to loopback; everything else does not resolve.
export async function launchSandboxBrowser(options: { hostMappings?: Record<string, string> } = {}): Promise<Browser> {
  // SharedWorker network traffic is invisible to Playwright's page-level request interception (and a browser-level CDP auto-attach cannot be
  // driven through Playwright's CDPSession), so the feature is removed from the browser instead of being filtered.
  const args = ["--block-new-web-contents", "--disable-blink-features=SharedWorker", "--disable-features=IsolateOrigins,site-per-process", "--disable-site-isolation-trials"];
  if (options.hostMappings) {
    const rules = Object.entries(options.hostMappings).map(([host, address]) => `MAP ${host} ${address}`);
    args.push(`--host-resolver-rules=${[...rules, "MAP * ~NOTFOUND"].join(", ")}`);
  }
  return chromium.launch({ headless: true, args });
}

export const CONTEXT_OPTIONS = {
  viewport: { width: 1280, height: 800 },
  acceptDownloads: false,
  serviceWorkers: "block" as const,
  permissions: [] as string[],
  userAgent: "AccessibilityRedTeam-Adaptive/0.1 (experimental fixture harness)",
};

// ---------------------------------------------------------------- activation safety (extends journeys/safety.ts without editing it)

// Self-contained page-side function (evaluated as a string so it can be reused inside the observation script).
// Returns [safe, reason]. It is strictly narrower than journeys/safety.ts.
export const CLASSIFY_ACTIVATION_SRC = `(el) => {
  const RISKY = /log ?in|log ?out|sign ?in|sign ?up|register|anmeld|abmeld|passwor|kennwort|\\bpay|bezahl|zahlung|kauf|\\bbuy|purchase|checkout|bestell|\\border\\b|delet|lösch|loesch|remov|entfern|submit|\\bsend|senden|absenden|upload|hochlad|download|herunterlad|confirm|bestätig|bestaetig|accept all/i;
  const tag = el.tagName.toLowerCase();
  const text = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("value") || el.getAttribute("title") || "").trim();
  if (el.closest("form")) return [false, "inside_form"];
  if (el.hasAttribute("form") || el.hasAttribute("formaction")) return [false, "form_association"];
  if (tag === "input" || tag === "select" || tag === "textarea") return [false, "field_control"];
  if (el.hasAttribute("download")) return [false, "download_attribute"];
  const target = el.getAttribute("target");
  if (target && target !== "_self") return [false, "opens_new_context"];
  if (el.disabled || el.getAttribute("aria-disabled") === "true") return [false, "disabled"];
  if (RISKY.test(text)) return [false, "risky_label"];
  if (tag === "button") return (el.getAttribute("type") || "submit").toLowerCase() === "button" ? [true, "button_type_button"] : [false, "button_not_type_button"];
  if (tag === "a") return (el.getAttribute("href") || "").startsWith("#") ? [true, "same_page_anchor"] : [false, "link_navigates_use_navigate_action"];
  return el.getAttribute("role") === "button" ? [true, "role_button"] : [false, "not_button_like"];
}`;

export async function classifyActivation(locator: Locator): Promise<{ safe: boolean; reason: string }> {
  // CLASSIFY_ACTIVATION_SRC is a constant of this module, never model or page text.
  const extended = await locator.evaluate((el, src) => (new Function(`return (${src})`))()(el), CLASSIFY_ACTIVATION_SRC).catch(() => [false, "classification_failed"]) as [boolean, string];
  if (!extended[0]) return { safe: false, reason: extended[1] };
  // The production rule is applied as well; both must agree.
  const base = await isSafeActivationTarget(locator);
  return base ? { safe: true, reason: extended[1] } : { safe: false, reason: "journeys_safety_rule_rejected" };
}
