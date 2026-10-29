#!/usr/bin/env python3
"""Bounded multi-origin source discovery for the Basel map (docs/experiments/basel-discovery/DISCOVERY_PLAN.md, §2).

Usage:
  python3 -I scripts/basel_discovery_sources.py <store> register <origin> <justification_url> "<why relevant>"
  python3 -I scripts/basel_discovery_sources.py <store> fetch <url> [<url> ...]

Only manually registered origins (each with an official backlink/primary source) can be fetched; at most 20 origins and
60 HTML documents in total (ledger in <store>). Per origin: robots.txt is read once (not counted as HTML) and its
Crawl-delay honoured, minimum 3 s (www.bs.ch: 10 s); Disallow rules for * are respected. GET only, no cookies,
redirects are recorded and NOT followed, no retries, no forms. Raw HTML stored with SHA-256 for citation checks.
"""
import hashlib, html.parser, json, os, sys, time, urllib.error, urllib.parse, urllib.request, urllib.robotparser
from datetime import datetime, timezone

MAX_DOCS, MAX_ORIGINS, MIN_DELAY = 60, 20, 3
UA = "AccessibilityRedTeam/0.1 (+public accessibility research; discovery only)"
store, cmd, args = sys.argv[1], sys.argv[2], sys.argv[3:]
os.makedirs(os.path.join(store, "html"), exist_ok=True)
lp = os.path.join(store, "ledger.json")
L = json.load(open(lp)) if os.path.exists(lp) else {"origins": {}, "fetched": []}
save = lambda: json.dump(L, open(lp, "w"), indent=1, ensure_ascii=False)
now = lambda: datetime.now(timezone.utc).isoformat()

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
opener = urllib.request.build_opener(NoRedirect)

def origin_of(u):
    p = urllib.parse.urlsplit(u); return f"{p.scheme}://{p.netloc}"

if cmd == "register":
    o, just, why = args
    if not o.startswith("https://") or origin_of(o) != o: sys.exit(f"origin must be https://host only: {o}")
    if o in L["origins"]: sys.exit(f"already registered: {o}")
    if len(L["origins"]) >= MAX_ORIGINS: sys.exit("STOP: origin cap reached")
    rp, delay, robots = urllib.robotparser.RobotFileParser(), MIN_DELAY, None
    try:
        res = opener.open(urllib.request.Request(o + "/robots.txt", headers={"User-Agent": UA}), timeout=20)
        robots = res.read(200_000).decode("utf-8", "replace"); rp.parse(robots.splitlines())
        delay = max(MIN_DELAY, int(float(rp.crawl_delay("*") or 0)))
    except Exception as e:
        robots = f"unavailable: {type(e).__name__}"
    if o == "https://www.bs.ch": delay = max(delay, 10)
    L["origins"][o] = {"justification": just, "why": why, "registeredAt": now(), "delay": delay, "robots": robots[:4000], "lastRequestAt": time.time()}
    save(); print(f"registered {o} delay={delay}s robots={'ok' if not str(robots).startswith('unavailable') else robots}")

elif cmd == "fetch":
    for url in args:
        o = origin_of(url)
        if o not in L["origins"]: print(f"REFUSED (origin not registered): {url}"); continue
        if any(f["url"] == url for f in L["fetched"]): print(f"skip (already fetched): {url}"); continue
        if len(L["fetched"]) >= MAX_DOCS: print("STOP: document cap reached"); break
        meta = L["origins"][o]; rp = urllib.robotparser.RobotFileParser()
        if not meta["robots"].startswith("unavailable"):
            rp.parse(meta["robots"].splitlines())
            if not rp.can_fetch("*", url): print(f"REFUSED (robots.txt): {url}"); continue
        wait = meta["lastRequestAt"] + meta["delay"] - time.time()
        if wait > 0: time.sleep(wait)
        meta["lastRequestAt"] = time.time(); save()
        e = {"url": url, "origin": o, "at": now()}
        try:
            res = opener.open(urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"}), timeout=30)
            body = res.read(4_000_000); e.update(status=res.status, contentType=res.headers.get("content-type", ""), lastModified=res.headers.get("last-modified"))
        except urllib.error.HTTPError as err:
            body = b""; e.update(status=err.code)
            if err.code in (301, 302, 303, 307, 308):
                e["redirect"] = urllib.parse.urljoin(url, err.headers.get("location") or "")
        except Exception as err:
            body = b""; e.update(status=None, error=type(err).__name__)
        if body:
            d = hashlib.sha256(body).hexdigest(); name = f"{len(L['fetched']) + 1:02d}-{d[:12]}.html"
            open(os.path.join(store, "html", name), "wb").write(body); e.update(sha256=d, file=name, bytes=len(body))
        L["fetched"].append(e); save()
        print(f"{e.get('status')} {url} {('-> ' + e['redirect']) if e.get('redirect') else ''}")
    print(f"documents {len(L['fetched'])}/{MAX_DOCS}, origins {len(L['origins'])}/{MAX_ORIGINS}")
