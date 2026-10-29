#!/usr/bin/env python3
"""Render the A/B/C evidence report (German, self-contained HTML + short Markdown) from sealed run artifacts.

Usage: python3 -I scripts/abc_report.py <config.json>
config: {"out": dir, "segments": [{"id","label","dir","judgment","key"}], "repro": {"original": dir, "repaired": dir},
         "cases": [...], "contributions": {...}, "nextStep": str, "meta": {...}}
Everything shown is read from the artifacts; prose comes from the config, written after inspecting them.
"""
import base64, hashlib, html, json, os, shutil, sys

cfg = json.load(open(sys.argv[1]))
out = cfg["out"]
os.makedirs(os.path.join(out, "img"), exist_ok=True)
E = html.escape

def load(p):
    return json.load(open(p))

LABEL = {"A": "A · algorithmisch", "B": "B · lokales LLM", "C": "C · lokales LLM + Mistral"}
MODEL = {"A": "keins (Frontier-Scheduler + Regeltabelle)", "B": "qwen3:1.7b (Ollama, CPU, lokal)", "C": "qwen3:1.7b lokal + mistral-small-2603 (≤2 Konsultationen)"}

def segment_rows(seg):
    funnel = load(os.path.join(seg["dir"], "funnel.json"))["rows"]
    ledger = load(os.path.join(seg["dir"], "ledger.json"))
    judg = load(seg["judgment"]) if seg.get("judgment") else None
    key = load(seg["key"]) if seg.get("key") else {}
    verdicts = {}
    if judg:
        for p in judg["packets"]:
            path = key.get(p["arm"], "")
            cond = path.split("/")[-1]
            for c in p["claims"]:
                if c["claimId"] != "completion":
                    verdicts.setdefault(cond, []).append(c["verdict"])
    rows = []
    for cond in ("A", "B", "C"):
        rs = [r for r in funnel if r["condition"] == cond]
        if not rs:
            continue
        seeded = sum(len(r["defects"]) for r in rs)
        credited = sum(d["credited"] for r in rs for d in r["defects"])
        statuses = {}
        for r in rs:
            statuses[r["terminal"]] = statuses.get(r["terminal"], 0) + 1
        v = verdicts.get(cond, [])
        rows.append({
            "cond": cond, "planned": len(rs), "completedFinish": sum(1 for r in rs if r["proposal"] is not None),
            "statuses": statuses, "seeded": seeded, "credited": credited,
            "claims": len(v), "supported": v.count("supported_observation"), "contradicted": v.count("contradicted"),
            "insufficient": v.count("insufficient_evidence") + v.count("fresh_reproduction_needed"),
            "unadjudicated": sum(len(r["unadjudicated"]) for r in rs), "premature": sum(1 for r in rs if r["prematureCompletion"]),
            "calls": sum(r["modelCalls"] for r in rs), "pages": f'{sum(r["coverage"]["pagesVisited"] for r in rs)}/{sum(r["coverage"]["pagesDiscovered"] for r in rs)}',
            "probes": f'{sum(r["coverage"]["probesExecuted"] for r in rs)}/{sum(r["coverage"]["probesTotal"] for r in rs)}',
            "seconds": None, "spend": ledger["consultant"]["spend"] if cond == "C" else None,
        })
    return rows, ledger

def durations(seg):
    out = {}
    for root, _, files in os.walk(seg["dir"]):
        if "result.json" in files:
            r = load(os.path.join(root, "result.json"))
            cond = root.rstrip("/").split("/")[-1]
            out[cond] = out.get(cond, 0) + (r.get("durationMs") or 0) / 1000
    return out

def img(src, name):
    dst = os.path.join(out, "img", name)
    shutil.copy(src, dst)
    return f"img/{name}"

css = """
:root{--bg:#fbfbf9;--fg:#1c1d1f;--muted:#5d6168;--line:#d9dad6;--card:#fff;--ok:#1d6b3a;--bad:#a1261e;--warn:#8a5a00;--accent:#2b4fa3}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#141517;--fg:#e8e8e6;--muted:#a3a7ad;--line:#33363b;--card:#1c1e21;--ok:#6fcf8e;--bad:#f08a80;--warn:#e3b45a;--accent:#8fb0ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1080px;margin:0 auto;padding:24px 16px 64px}h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.2rem;margin:36px 0 8px;border-top:1px solid var(--line);padding-top:20px}h3{font-size:1rem;margin:18px 0 6px}
.lead{color:var(--muted);margin:0 0 16px}.tag{display:inline-block;border:1px solid var(--line);border-radius:4px;padding:0 6px;font-size:.8rem;color:var(--muted)}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--card)}table{border-collapse:collapse;width:100%;font-size:.88rem}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-weight:600;background:color-mix(in srgb,var(--line) 35%,transparent)}
.num{text-align:right;font-variant-numeric:tabular-nums}.ok{color:var(--ok);font-weight:600}.bad{color:var(--bad);font-weight:600}.warn{color:var(--warn)}
.case{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin:16px 0}.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin:10px 0}
figure{margin:0}figure img{width:100%;border:1px solid var(--line);border-radius:4px}figcaption{font-size:.8rem;color:var(--muted)}
pre{background:color-mix(in srgb,var(--line) 30%,transparent);padding:8px;border-radius:4px;overflow-x:auto;font-size:.8rem}ul{padding-left:20px}.small{font-size:.82rem;color:var(--muted)}
.next{border-left:4px solid var(--accent);padding:8px 14px;background:var(--card)}
"""

parts = [f"<!doctype html><html lang='de'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>A/B/C-Vergleich</title><style>{css}</style></head><body><main>"]
m = cfg["meta"]
parts.append(f"<h1>A/B/C-Vergleich: algorithmisch, lokales LLM, lokales LLM + Mistral</h1><p class='lead'>{E(m['subtitle'])}</p>")
parts.append("<p>" + " ".join(f"<span class='tag'>{E(t)}</span>" for t in m["tags"]) + "</p>")
parts.append(f"<p>{m['summaryHtml']}</p>")

for seg in cfg["segments"]:
    rows, ledger = segment_rows(seg)
    dur = durations(seg)
    parts.append(f"<h2>{E(seg['label'])}</h2><p class='small'>{E(seg['note'])}</p><div class='tw'><table><thead><tr><th>Bedingung</th><th>Modell(e)</th><th class='num'>Sitzungen mit Abschlussvorschlag / geplant</th><th>Sitzungsende</th><th class='num'>Verifizierte Barrieren</th><th class='num'>Behauptungen: belegt / widerlegt / unzureichend</th><th class='num'>Vorzeitiger Abschluss</th><th class='num'>Seiten besucht / entdeckt</th><th class='num'>Prüfungen ausgeführt / gesamt</th><th class='num'>Modellaufrufe (lokal)</th><th class='num'>Zeit (s)</th><th class='num'>Mistral (USD)</th></tr></thead><tbody>")
    for r in rows:
        st = ", ".join(f"{k}: {v}" for k, v in sorted(r["statuses"].items()))
        ver_cls = "ok" if r["credited"] == r["seeded"] else "bad" if r["credited"] == 0 else "warn"
        claims = f'{r["supported"]} / <span class="{"bad" if r["contradicted"] else ""}">{r["contradicted"]}</span> / {r["insufficient"]}' if r["claims"] else "0 Behauptungen"
        spend = f'{r["spend"]:.4f}' if r["spend"] is not None else "–"
        parts.append(f"<tr><td>{E(LABEL[r['cond']])}</td><td>{E(MODEL[r['cond']])}</td><td class='num'>{r['completedFinish']} / {r['planned']}</td><td>{E(st)}</td><td class='num {ver_cls}'>{r['credited']} / {r['seeded']}</td><td class='num'>{claims}</td><td class='num'>{r['premature']}</td><td class='num'>{r['pages']}</td><td class='num'>{r['probes']}</td><td class='num'>{r['calls']}</td><td class='num'>{dur.get(r['cond'], 0):.0f}</td><td class='num'>{spend}</td></tr>")
    parts.append("</tbody></table></div>")
    parts.append(f"<p class='small'>Mistral-Ledger dieses Segments: {ledger['consultant']['calls']} Aufrufe, {ledger['consultant']['inputTokens']} / {ledger['consultant']['outputTokens']} Tokens, geschätzt {ledger['consultant']['spend']:.4f} USD (Preise laut Konfiguration; maßgeblich ist die Rechnung). Behauptungen wurden blind (anonymisierte Arme) von einem frischen Claude-Kontext beurteilt und danach mit der Fixture-Wahrheit abgeglichen.</p>")

parts.append(f"<h2>Fälle</h2><p class='small'>{E(cfg['casesNote'])}</p>")
for c in cfg["cases"]:
    parts.append(f"<section class='case'><h3>{E(c['title'])}</h3><p><b>Aufgabe:</b> {E(c['task'])}<br><b>Einschränkung:</b> {E(c['constraint'])}</p>")
    if c.get("shots"):
        parts.append("<div class='shots'>")
        for s in c["shots"]:
            parts.append(f"<figure><img src='{img(s['src'], s['name'])}' alt='{E(s['alt'])}'><figcaption>{E(s['caption'])}</figcaption></figure>")
        parts.append("</div>")
    if c.get("trace"):
        parts.append(f"<pre>{E(c['trace'])}</pre>")
    parts.append("<ul>" + "".join(f"<li><b>{E(k)}:</b> {v}</li>" for k, v in c["abc"]) + "</ul>")
    parts.append(f"<p>{c['bodyHtml']}</p><p class='small'>{E(c['refs'])}</p></section>")

parts.append("<h2>Was jeder Ansatz beigetragen hat</h2><ul>" + "".join(f"<li><b>{E(k)}:</b> {v}</li>" for k, v in cfg["contributions"]) + "</ul>")
parts.append(f"<h2>Grenzen</h2><ul>{''.join(f'<li>{E(x)}</li>' for x in cfg['limits'])}</ul>")
parts.append(f"<h2>Nächster Schritt</h2><div class='next'>{cfg['nextStepHtml']}</div>")
parts.append(f"<p class='small'>{E(m['footer'])}</p></main></body></html>")
open(os.path.join(out, "index.html"), "w").write("\n".join(parts))
print(os.path.join(out, "index.html"))
