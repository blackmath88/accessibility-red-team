#!/usr/bin/env python3
"""Validate the Basel discovery map (v2) and embed it into index.html.

discovery-data.json is the single source. This script validates it against the
rules in docs/experiments/basel-discovery/SCHEMA.md and writes the same JSON into
the one <script type="application/json" id="discovery-data"> block of index.html,
so the file and the embed cannot diverge. Stdlib only; runs under `python3 -I`.

  python3 -I scripts/basel_discovery_build.py            # validate + embed
  python3 -I scripts/basel_discovery_build.py --check    # validate + verify embed, write nothing
  python3 -I scripts/basel_discovery_build.py --data test/fixtures/basel-discovery-sample.json --out /tmp/x.html
"""
import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA = ROOT / "docs/experiments/basel-discovery/discovery-data.json"
DEFAULT_HTML = ROOT / "docs/experiments/basel-discovery/index.html"

SCHEMA = "art/basel-discovery/v2"
EMBED_RE = re.compile(
    r'(<script type="application/json" id="discovery-data">)(.*?)(</script>)', re.S
)

# Historical #53 field batch: service id -> assessment id. Must never change.
HISTORICAL_SERVICES = [f"S{i:02d}" for i in range(1, 26)]
HISTORICAL_ASSESSMENTS = {
    "S01": "p01-start", "S02": "p12-eportal", "S04": "p02-umzug", "S06": "p04-zuzug",
    "S07": "p03-pass", "S08": "p05-abfall", "S09": "p06-zonensuche",
    "S11": "p07-sozialhilferechner", "S14": "p08-anwohnerparkkarte",
    "S15": "p09-behindertenparkkarte", "S17": "p10-steuerformulare", "S19": "p11-kita",
}
AUTHORIZED_ORIGINS = {"https://www.bs.ch", "https://eportal.egov.bs.ch"}

ORG_TYPES = {"canton_unit", "municipality", "buergergemeinde", "parliament", "judiciary",
             "public_institution", "joint_institution", "private_partner", "federal", "unknown"}
SPONSORSHIP = {"canton_unit", "owned_public_entity", "jointly_sponsored",
               "state_participation", "private", "unknown"}
WP_KINDS = {"portal", "website", "transaction_app", "login", "map",
            "external_service", "document_store"}
WP_STATUS = ("discovered", "ownershipEvidenced", "selected", "assessed",
             "outOfScope", "loginBoundary")
ORG_STATUS = ("discovered", "ownershipEvidenced")
RELATIONS = {"parent_of", "jurisdiction_over", "owns_or_sponsors", "jointly_sponsors",
             "participates_in", "responsible_editorially", "operates_technically",
             "publishes_property", "entry_point_of", "transaction_boundary", "embeds",
             "links_to"}
CONFIDENCE = {"high", "medium", "low"}
RINGS = {"core", "other_public", "external_dependency"}


def is_https_url(value):
    if not isinstance(value, str):
        return False
    try:
        u = urlsplit(value)
        return u.scheme == "https" and bool(u.hostname) and u.username is None and u.port is None
    except ValueError:
        return False


def origin_problem(value):
    """Return None if value is a bare https origin like https://www.bs.ch."""
    if not isinstance(value, str):
        return "not a string"
    try:
        u = urlsplit(value)
        port = u.port
    except ValueError as exc:
        return str(exc)
    if u.scheme != "https":
        return "scheme must be https"
    if not u.hostname or u.netloc != u.hostname or u.hostname != u.hostname.lower():
        return "host must be lowercase, without userinfo or port"
    if port is not None or u.path or u.query or u.fragment or value.endswith("/"):
        return "origin must not carry a port, path, query, fragment or trailing slash"
    return None


def is_date(value, with_time):
    if not isinstance(value, str):
        return False
    try:
        if with_time:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
            return "T" in value
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def validate(data):
    errors = []
    err = errors.append

    if data.get("schema") != SCHEMA:
        err(f"schema must be {SCHEMA!r}, got {data.get('schema')!r}")
    if not is_date(data.get("lastDiscovery"), False):
        err("lastDiscovery must be a YYYY-MM-DD date")
    for key in ("entries", "hosts", "areas", "organisations", "webProperties", "edges", "batchProposal"):
        if not isinstance(data.get(key), list):
            err(f"{key} must be an array")
    if errors:
        return errors

    entries, orgs, wps, edges = data["entries"], data["organisations"], data["webProperties"], data["edges"]

    # Historical services and assessments are fixed.
    service_ids = [e.get("serviceId") for e in entries]
    if service_ids != HISTORICAL_SERVICES:
        err("entries must be exactly the historical services S01..S25 in order")
    found = {e.get("serviceId"): (e.get("status") or {}).get("assessmentId")
             for e in entries if (e.get("status") or {}).get("assessmentId")}
    if found != HISTORICAL_ASSESSMENTS:
        err("historical assessment ids p01..p12 changed: " + json.dumps(found, sort_keys=True))

    # Unique ids across all record kinds.
    seen = {}
    for kind, records, field in (("service", entries, "serviceId"), ("organisation", orgs, "id"),
                                 ("webProperty", wps, "id"), ("edge", edges, "id")):
        for r in records:
            rid = r.get(field)
            if not isinstance(rid, str) or not rid:
                err(f"{kind} without {field}: {json.dumps(r, ensure_ascii=False)[:80]}")
            elif rid in seen:
                err(f"duplicate id {rid!r} ({seen[rid]} and {kind})")
            else:
                seen[rid] = kind
    nodes = {k for k, v in seen.items() if v != "edge"}
    area_ids = {a.get("id") for a in data["areas"]}
    org_ids = {o.get("id") for o in orgs}
    wp_ids = {w.get("id") for w in wps}

    for o in orgs:
        oid = o.get("id")
        if not str(oid).startswith("org-"):
            err(f"organisation {oid}: id must start with 'org-'")
        if not o.get("name"):
            err(f"organisation {oid}: name missing")
        if o.get("area") not in area_ids:
            err(f"organisation {oid}: area {o.get('area')!r} does not resolve")
        if o.get("type") not in ORG_TYPES:
            err(f"organisation {oid}: type {o.get('type')!r} not in schema")
        if o.get("sponsorship") not in SPONSORSHIP:
            err(f"organisation {oid}: sponsorship {o.get('sponsorship')!r} not in schema")
        if o.get("parentId") is not None and o.get("parentId") not in org_ids:
            err(f"organisation {oid}: parentId {o.get('parentId')!r} does not resolve")
        status = o.get("status")
        if not isinstance(status, dict) or any(not isinstance(status.get(s), bool) for s in ORG_STATUS):
            err(f"organisation {oid}: status needs booleans {', '.join(ORG_STATUS)}")

    origins = {}
    for w in wps:
        wid = w.get("id")
        if not str(wid).startswith("wp-"):
            err(f"webProperty {wid}: id must start with 'wp-'")
        origin = w.get("origin")
        problem = origin_problem(origin)
        if problem:
            err(f"webProperty {wid}: origin {origin!r} invalid ({problem})")
        elif origin in origins:
            err(f"webProperty {wid}: origin {origin} duplicates {origins[origin]} (use alternates)")
        else:
            origins[origin] = wid
        canonical = w.get("canonicalUrl")
        if not is_https_url(canonical) or not (canonical == origin or canonical.startswith(f"{origin}/")):
            err(f"webProperty {wid}: canonicalUrl {canonical!r} must be https and start with its origin")
        alternates = w.get("alternates", [])
        if not isinstance(alternates, list) or any(not is_https_url(a) for a in alternates):
            err(f"webProperty {wid}: alternates must be a list of https URLs")
        if w.get("kind") not in WP_KINDS:
            err(f"webProperty {wid}: kind {w.get('kind')!r} not in schema")
        status = w.get("status")
        if not isinstance(status, dict) or any(not isinstance(status.get(s), bool) for s in WP_STATUS):
            err(f"webProperty {wid}: status needs booleans {', '.join(WP_STATUS)}")
        if w.get("assessmentAuthorized") is not False and w.get("assessmentAuthorized") is not True:
            err(f"webProperty {wid}: assessmentAuthorized must be a boolean")
        if w.get("assessmentAuthorized") is True and origin not in AUTHORIZED_ORIGINS:
            err(f"webProperty {wid}: assessmentAuthorized true is only allowed for "
                + " and ".join(sorted(AUTHORIZED_ORIGINS)))
        hist = w.get("historicalAssessmentIds", [])
        if not isinstance(hist, list) or not set(hist) <= set(HISTORICAL_ASSESSMENTS.values()):
            err(f"webProperty {wid}: historicalAssessmentIds must come from the #53 batch p01..p12")

    for e in edges:
        eid = e.get("id")
        if not str(eid).startswith("e-"):
            err(f"edge {eid}: id must start with 'e-'")
        for end in ("from", "to"):
            if e.get(end) not in nodes:
                err(f"edge {eid}: {end} {e.get(end)!r} does not resolve to an organisation, webProperty or service")
        if e.get("relation") not in RELATIONS:
            err(f"edge {eid}: relation {e.get('relation')!r} not in schema")
        evidence = e.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            err(f"edge {eid}: needs at least one evidence item")
            continue
        for i, ev in enumerate(evidence):
            where = f"edge {eid} evidence[{i}]"
            if not is_https_url(ev.get("url")):
                err(f"{where}: url must be https")
            if not isinstance(ev.get("support"), str) or not ev["support"].strip():
                err(f"{where}: support missing")
            if not is_date(ev.get("retrievedAt"), True):
                err(f"{where}: retrievedAt must be an ISO date-time")
            if ev.get("sourceDate") is not None and not is_date(ev.get("sourceDate"), False):
                err(f"{where}: sourceDate must be YYYY-MM-DD or null")
            if ev.get("confidence") not in CONFIDENCE:
                err(f"{where}: confidence must be high, medium or low")

    ranks = set()
    for b in data["batchProposal"]:
        rank = b.get("rank")
        where = f"batchProposal rank {rank}"
        if not isinstance(rank, int) or rank < 1 or rank in ranks:
            err(f"{where}: rank must be a unique positive integer")
        ranks.add(rank)
        if not is_https_url(b.get("url")):
            err(f"{where}: url must be https")
        if b.get("propertyId") not in wp_ids:
            err(f"{where}: propertyId {b.get('propertyId')!r} does not resolve")
        if b.get("serviceId") is not None and b.get("serviceId") not in service_ids:
            err(f"{where}: serviceId {b.get('serviceId')!r} does not resolve")
        if b.get("ring") not in RINGS:
            err(f"{where}: ring {b.get('ring')!r} not in schema")
        if not b.get("reason") or not b.get("authorisationNeeded"):
            err(f"{where}: reason and authorisationNeeded are required")

    return errors


def embed_text(data):
    # `<` as < keeps the block unbreakable (no </script>, <!--) and parses to the same object.
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA)
    ap.add_argument("--html", type=Path, default=DEFAULT_HTML, help="template page (default: index.html)")
    ap.add_argument("--out", type=Path, help="output page (default: overwrite --html)")
    ap.add_argument("--check", action="store_true", help="validate and verify the embed; write nothing")
    args = ap.parse_args(argv)

    if args.data.resolve() != DEFAULT_DATA and not args.out and not args.check:
        ap.error("--out is required with a non-default --data (protects the real index.html)")

    try:
        data = json.loads(args.data.read_text(encoding="utf-8"))
        html = args.html.read_text(encoding="utf-8")
    except (OSError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    errors = validate(data)
    if errors:
        print(f"{args.data}: {len(errors)} validation error(s):", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    blocks = EMBED_RE.findall(html)
    if len(blocks) != 1:
        print(f'error: {args.html} must contain exactly one <script type="application/json" '
              f'id="discovery-data"> block, found {len(blocks)}', file=sys.stderr)
        return 1

    counts = ", ".join(f"{len(data[k])} {k}" for k in ("organisations", "webProperties", "edges", "batchProposal"))
    if args.check:
        if json.loads(blocks[0][1]) != data:
            print(f"error: embedded data in {args.html} differs from {args.data}; run the build", file=sys.stderr)
            return 1
        print(f"ok: {args.data} valid and embedded identically ({counts})")
        return 0

    m = EMBED_RE.search(html)
    out_html = html[:m.start(2)] + embed_text(data) + html[m.end(2):]
    out = args.out or args.html
    if out.exists() and out.read_text(encoding="utf-8") == out_html:
        print(f"ok: {out} already up to date ({counts})")
    else:
        out.write_text(out_html, encoding="utf-8")
        print(f"ok: wrote {out} ({counts})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
