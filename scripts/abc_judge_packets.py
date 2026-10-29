#!/usr/bin/env python3
"""Build anonymized judge packets from sealed A/B/C session directories (experimental adaptive track).

Usage: python3 -I scripts/abc_judge_packets.py <run_dir> <out_dir>

Each packet holds only what the tester recorded: claims (candidate findings and the finish proposal) with the
evidence they cite (page path, kind, target, the tester's own note, relevant DOM facts, screenshot file).
It never contains: condition or provider labels, model ids, costs, consultation logs, fixture truth, or the
fixture name (sessions are shuffled and given random arm ids; the key goes to a separate file the judge never sees).
"""
import hashlib, json, os, random, re, shutil, sys
from urllib.parse import urlparse

run_dir, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
sessions = []
for root, dirs, files in os.walk(run_dir):
    if "result.json" in files and "candidates.json" in files:
        sessions.append(root)
sessions.sort()
rng = random.Random(hashlib.sha256(run_dir.encode()).hexdigest())  # deterministic per run dir, unknown to the judge
rng.shuffle(sessions)

def path_of(url):
    try:
        p = urlparse(url).path
    except Exception:
        return url
    parts = p.strip("/").split("/")
    return "/" + "/".join(parts[1:]) if len(parts) > 1 else p  # drop the fixture directory name

RULE_PREFIX = re.compile(r"^R\d+-[a-z-]+:\s*")  # the scheduler's rule ids would reveal the algorithmic arm; stripped in the judge copy only

def note(text):
    return RULE_PREFIX.sub("", text) if isinstance(text, str) else text

def facts(dom):
    keep = {}
    for k in ("skipLinks", "dialogs", "focus", "controls"):
        if k in dom:
            v = dom[k]
            if k == "controls" and isinstance(v, list):
                v = [{x: c.get(x) for x in ("ref", "tag", "role", "name", "id", "hasAccessibleName", "expanded", "controls", "haspopup")} for c in v][:20]
            keep[k] = v
    return keep

key = {}
for i, s in enumerate(sessions):
    arm = f"arm-{hashlib.sha256((s + 'salt').encode()).hexdigest()[:5]}"
    key[arm] = os.path.relpath(s, run_dir)
    ev = {e["id"]: e for e in json.load(open(os.path.join(s, "evidence.json")))}
    cands = json.load(open(os.path.join(s, "candidates.json")))
    result = json.load(open(os.path.join(s, "result.json")))
    shots = os.path.join(out_dir, arm)
    os.makedirs(shots, exist_ok=True)

    def evidence(ref):
        e = ev.get(ref)
        if not e:
            return {"id": ref, "missing": True}
        shot = None
        if e.get("screenshot"):
            src = os.path.join(s, e["screenshot"]["path"])
            if os.path.exists(src):
                shot = os.path.join(arm, os.path.basename(src))
                shutil.copy(src, os.path.join(out_dir, shot))
        t = e.get("target") or None
        return {"id": ref, "kind": e["kind"], "page": path_of(e["url"]), "target": t and {k: t.get(k) for k in ("tag", "role", "name", "id", "selectorHint")},
                "testerNote": note(e.get("note")), "focusBefore": (e.get("pre") or {}).get("active"), "focusAfter": (e.get("post") or {}).get("active"),
                "dialogsOpenBefore": (e.get("pre") or {}).get("dialogsOpen"), "dialogsOpenAfter": (e.get("post") or {}).get("dialogsOpen"),
                "domFacts": facts(e.get("domFacts") or {}), "screenshot": shot}

    claims = []
    for c in cands:
        f = c.get("finding") or {}
        claims.append({"claimId": c["id"], "kind": "candidate_finding", "harnessStatus": c["status"], "category": f.get("category"), "claim": f.get("claim"),
                       "reproductionSteps": f.get("reproductionSteps"), "citedEvidence": [evidence(r) for r in f.get("observationRefs", [])]})
    proposal = (result.get("completion") or {}).get("proposal") if isinstance(result.get("completion"), dict) else None
    claims.append({"claimId": "completion", "kind": "completion_proposal", "claim": f"tester proposed: {proposal or 'no finish proposal (session ended without finish)'}",
                   "finishSummary": re.sub(r"^frontier-scheduler/v\d+:\s*", "", result.get("finishSummary") or "") or None, "sessionEnd": result.get("status")})
    packet = {"arm": arm, "userTask": "Check this synthetic municipal-style test site for keyboard and screen-reader barriers: skip links, accessible names, dialog focus handling.",
              "constraint": "Read-only exploration of loopback test pages; no form submission.", "claims": claims,
              "allEvidenceIndex": [{"id": k, "kind": v["kind"], "page": path_of(v["url"]), "targetRef": (v.get("target") or {}).get("ref"), "testerNote": note(v.get("note"))} for k, v in ev.items()]}
    with open(os.path.join(out_dir, f"{arm}.json"), "w") as fh:
        json.dump(packet, fh, indent=1, ensure_ascii=False)

with open(os.path.join(out_dir, "..", os.path.basename(out_dir.rstrip("/")) + ".KEY.json"), "w") as fh:
    json.dump(key, fh, indent=1)
digest = {f: hashlib.sha256(open(os.path.join(out_dir, f), "rb").read()).hexdigest() for f in sorted(os.listdir(out_dir)) if f.endswith(".json")}
with open(os.path.join(out_dir, "INPUT_HASHES.json"), "w") as fh:
    json.dump(digest, fh, indent=1)
print(f"{len(sessions)} packets -> {out_dir}")
