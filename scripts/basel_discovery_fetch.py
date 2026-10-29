#!/usr/bin/env python3
"""Polite, bounded discovery fetcher for the Basel field handoff (docs/experiments/BASEL_FIELD_HANDOFF.md).

Usage: python3 -I scripts/basel_discovery_fetch.py <store_dir> <url> [<url> ...]

Fetches only the explicitly listed URLs (no link traversal), one at a time, and only on the two authorised origins.
Enforces across every invocation (ledger.json in <store_dir>): at most 40 unique HTML documents, at least
DELAY_S seconds between requests (robots.txt of www.bs.ch asks for Crawl-delay 10), no retries, GET only, no cookies
kept, redirects NOT followed (a redirect is recorded as a boundary). Raw HTML is stored with its SHA-256 and the
same-origin links found in it, for the coordinator to choose the next documents by hand.
"""
import hashlib, html.parser, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

ALLOWED = {"https://www.bs.ch", "https://eportal.egov.bs.ch"}
MAX_DOCS = 40
DELAY_S = 10
UA = "AccessibilityRedTeam/0.1 (+public accessibility research)"

store, urls = sys.argv[1], sys.argv[2:]
os.makedirs(os.path.join(store, "html"), exist_ok=True)
ledger_path = os.path.join(store, "ledger.json")
ledger = json.load(open(ledger_path)) if os.path.exists(ledger_path) else {"fetched": [], "lastRequestAt": 0}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

opener = urllib.request.build_opener(NoRedirect)

class Links(html.parser.HTMLParser):
    def __init__(self, base):
        super().__init__(); self.base = base; self.links = []; self._a = None; self.title = ""; self._t = False
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a" and a.get("href"):
            self._a = {"href": urllib.parse.urljoin(self.base, a["href"]).split("#")[0], "text": ""}
        if tag == "title": self._t = True
    def handle_data(self, data):
        if self._a is not None: self._a["text"] += data
        if self._t: self.title += data
    def handle_endtag(self, tag):
        if tag == "a" and self._a is not None:
            self._a["text"] = " ".join(self._a["text"].split())[:120]; self.links.append(self._a); self._a = None
        if tag == "title": self._t = False

def origin(u):
    p = urllib.parse.urlsplit(u); return f"{p.scheme}://{p.netloc}"

for url in urls:
    if origin(url) not in ALLOWED:
        print(f"REFUSED (origin not authorised): {url}"); continue
    if any(f["url"] == url for f in ledger["fetched"]):
        print(f"skip (already fetched): {url}"); continue
    if len([f for f in ledger["fetched"] if f.get("counted")]) >= MAX_DOCS:
        print(f"STOP: discovery cap of {MAX_DOCS} documents reached"); break
    wait = ledger["lastRequestAt"] + DELAY_S - time.time()
    if wait > 0: time.sleep(wait)
    ledger["lastRequestAt"] = time.time()
    json.dump(ledger, open(ledger_path, "w"), indent=1, ensure_ascii=False)  # persist before the request (crash-safe delay)
    at = datetime.now(timezone.utc).isoformat()
    entry = {"url": url, "at": at, "counted": True}
    try:
        res = opener.open(urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"}), timeout=30)
        body = res.read(3_000_000); entry.update(status=res.status, contentType=res.headers.get("content-type", ""))
    except urllib.error.HTTPError as e:
        entry.update(status=e.code, location=e.headers.get("location"), contentType=e.headers.get("content-type", "")); body = b""
        if e.code in (301, 302, 303, 307, 308):
            loc = urllib.parse.urljoin(url, e.headers.get("location") or "")
            entry["redirect"] = {"to": loc, "sameAuthorisedOrigin": origin(loc) in ALLOWED}
    except Exception as e:  # network error: recorded, never retried
        entry.update(status=None, error=type(e).__name__); body = b""
    if body:
        digest = hashlib.sha256(body).hexdigest()
        name = f"{len(ledger['fetched']) + 1:02d}-{digest[:12]}.html"
        open(os.path.join(store, "html", name), "wb").write(body)
        parser = Links(url)
        try: parser.feed(body.decode("utf-8", "replace"))
        except Exception: pass
        entry.update(sha256=digest, file=name, bytes=len(body), title=" ".join(parser.title.split())[:160],
                     links=[l for l in parser.links if l["href"].startswith("http")])
    ledger["fetched"].append(entry)
    json.dump(ledger, open(ledger_path, "w"), indent=1, ensure_ascii=False)
    print(f"{entry.get('status')} {url} {entry.get('title', '')[:60]} {'-> ' + entry['redirect']['to'] if entry.get('redirect') else ''}")
print(f"documents counted: {len([f for f in ledger['fetched'] if f.get('counted')])}/{MAX_DOCS}")
