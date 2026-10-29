#!/usr/bin/env python3
"""Bounded public field batch for the Basel handoff (docs/experiments/BASEL_FIELD_HANDOFF.md, Part 2).

Usage: python3 -I scripts/basel_field_batch.py <queue.json> <out_dir>

For each queued page, one at a time: the existing production `scan` (axe, screenshot, coverage) and then the
existing production `journey` (safe keyboard journeys: focus trace, expandables, dialog open+Escape, skip link;
no forms, no submit controls). Each is one top-level navigation. Enforced here: only the two authorised origins,
at most MAX_PAGES pages, at least GAP_S seconds between navigations (www.bs.ch robots.txt: Crawl-delay 10),
a WALL_S wall cap after which no new tool run starts, no retries. Writes run-manifest.json with per-page status,
durations, exit codes and artifact SHA-256s.
"""
import hashlib, json, os, subprocess, sys, time
from datetime import datetime, timezone

ALLOWED = ("https://www.bs.ch/", "https://eportal.egov.bs.ch/")
MAX_PAGES, GAP_S, WALL_S, TOOL_TIMEOUT_S = 12, 10, 25 * 60, 120
queue_path, out = sys.argv[1], sys.argv[2]
queue = json.load(open(queue_path))
os.makedirs(out, exist_ok=True)
repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
code_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True).stdout.strip()
dirty = bool(subprocess.run(["git", "status", "--porcelain", "--", "src", "package.json"], cwd=repo, capture_output=True, text=True).stdout.strip())
manifest = {"schema": "art/basel-field-batch/v1", "codeSha": code_sha, "dirty": dirty, "startedAt": datetime.now(timezone.utc).isoformat(),
            "limits": {"maxPages": MAX_PAGES, "gapSeconds": GAP_S, "wallSeconds": WALL_S, "toolTimeoutSeconds": TOOL_TIMEOUT_S, "retries": 0},
            "tools": ["scan (src/scan.ts)", "journey (src/journeys/engine.ts)"], "pages": []}
started, last_nav = time.time(), 0.0

def sha_tree(d):
    return {os.path.relpath(os.path.join(r, f), out): hashlib.sha256(open(os.path.join(r, f), "rb").read()).hexdigest()
            for r, _, fs in os.walk(d) for f in sorted(fs)} if os.path.isdir(d) else {}

def run(tool, url, target):
    global last_nav
    wait = last_nav + GAP_S - time.time()
    if wait > 0: time.sleep(wait)
    last_nav = time.time()
    t0 = time.time()
    try:
        p = subprocess.run(["npx", "tsx", "src/cli.ts", tool, url, "--out", target, "--no-events"], cwd=repo, capture_output=True, text=True, timeout=TOOL_TIMEOUT_S)
        status, tail = ("ok" if p.returncode == 0 else f"exit {p.returncode}"), (p.stderr or p.stdout)[-400:]
    except subprocess.TimeoutExpired:
        status, tail = "timeout", ""
    return {"tool": tool, "status": status, "seconds": round(time.time() - t0, 1), "at": datetime.fromtimestamp(t0, timezone.utc).isoformat(), "errorTail": tail if status != "ok" else None}

for i, item in enumerate(queue[:MAX_PAGES]):
    entry = {**item, "runs": []}
    if not item["url"].startswith(ALLOWED):
        entry["status"] = "refused: origin not authorised"; manifest["pages"].append(entry); continue
    for tool in ("scan", "journey"):
        if time.time() - started > WALL_S:
            entry["runs"].append({"tool": tool, "status": "not run: wall cap reached"}); continue
        target = os.path.join(out, item["id"], tool)
        entry["runs"].append(run(tool, item["url"], target))
        print(f"{item['id']} {tool}: {entry['runs'][-1]['status']} ({entry['runs'][-1].get('seconds')} s)", flush=True)
    entry["artifacts"] = sha_tree(os.path.join(out, item["id"]))
    manifest["pages"].append(entry)
    json.dump(manifest, open(os.path.join(out, "run-manifest.json"), "w"), indent=1, ensure_ascii=False)
manifest["finishedAt"] = datetime.now(timezone.utc).isoformat()
manifest["wallSeconds"] = round(time.time() - started, 1)
json.dump(manifest, open(os.path.join(out, "run-manifest.json"), "w"), indent=1, ensure_ascii=False)
print(f"done in {manifest['wallSeconds']} s")
