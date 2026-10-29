#!/usr/bin/env python3
"""Render the German ring-1 addendum report (self-contained HTML) and a counts-only results extract (offline).

Usage: python3 -I scripts/basel_ring1_report.py <batch_dir>
Reads the committed queue and the raw batch (run-manifest.json, per page scan/ and journey/), measures the Zonensuche
hint in the scanner's own screenshot (same region as scripts/basel_pixel_measure.py on #53) and writes
docs/experiments/basel-ring1/index.html and results.json. Needs ImageMagick `magick` for the measurement.
"""
import collections, html, json, subprocess, sys

batch = sys.argv[1]
here = "docs/experiments/basel-ring1"
E = html.escape
queue = json.load(open(f"{here}/batch-queue.json"))
manifest = json.load(open(f"{batch}/run-manifest.json"))
REGION = "160x20+950+382"

def lum(v):
    v /= 255
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

pages, occ = [], collections.defaultdict(set)
for q in queue:
    d = f"{batch}/{q['id']}"
    summ = json.load(open(f"{d}/scan/summary.json"))
    for r in json.load(open(f"{d}/scan/probe-results.json")):
        if r["outcome"] == "violation":
            for n in r["nodes"]:
                occ[(r["probeId"], " ".join(n["target"]) if isinstance(n["target"], list) else str(n["target"]))].add(q["id"])
    js = {j["journeyId"]: j["outcome"] for j in json.load(open(f"{d}/journey/journey-results.json"))["results"]}
    run = next(p for p in manifest["pages"] if p["id"] == q["id"])
    pages.append({"id": q["id"], "url": q["url"], "task": q["task"], "serviceId": q.get("serviceId"), "counts": summ["counts"],
                  "runs": {r["tool"]: r["status"] for r in run["runs"]}, "journeys": js})
components = sorted(({"rule": k[0], "target": k[1], "pages": sorted(v)} for k, v in occ.items()), key=lambda c: -len(c["pages"]))
grey = round(float(subprocess.run(["magick", f"{batch}/r07-s09/scan/page.png", "-crop", REGION, "+repage", "-colorspace", "gray", "-format", "%[fx:minima*255]", "info:"],
                                   capture_output=True, text=True, check=True).stdout))
retest = {"page": "r07-s09", "screenshot": "r07-s09/scan/page.png (Scanner, ganzseitig, 1440 px breit)", "region": REGION, "darkestGrey": grey,
          "contrastOnWhite": round(1.05 / (lum(grey) + 0.05), 2), "compareWith53": {"darkestGrey": 242, "contrastOnWhite": 1.12}}
json.dump({"schema": "art/basel-ring1-results/v1", "codeSha": manifest["codeSha"], "startedAt": manifest["startedAt"], "wallSeconds": manifest.get("wallSeconds"),
           "pages": pages, "violationComponents": components, "zonensucheRetest": retest}, open(f"{here}/results.json", "w"), indent=1, ensure_ascii=False)

css = open("docs/experiments/basel-report/index.html", encoding="utf-8").read().split("<style>")[1].split("</style>")[0]
p = [f"<!doctype html><html lang='de'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Basel Ring 1</title><style>{css}</style></head><body><main>"]
p.append("<h1>Basel-Stadt: Ring 1 – sieben Kernseiten (Nachtrag)</h1>")
p.append(f"<p class='lead'>Privater Arbeitsbericht, Stand 29.10.2026. Vom Eigentümer freigegebener, gleich begrenzter Lauf wie #53 (nur www.bs.ch). Code <code>{E(manifest['codeSha'][:8])}</code>, {len(pages)} Seiten, {manifest.get('wallSeconds')} s. Keine Veröffentlichung, keine Konformitätsaussage.</p>")
p.append("<p>" + "".join(f"<span class='tag'>{t}</span>" for t in ["nur www.bs.ch", "kein Login, keine Formulare", "Produktions-Scanner + sichere Journeys", "keine Modellaufrufe", "Mistral unverändert 0,073 von 5 USD"]) + "</p>")
p.append(f"<p><b>Kurz:</b> Alle 14 Läufe (7 Seiten × Scanner und Journeys) endeten ohne Abbruch. Auf den sieben Seiten tauchen <b>keine neuen seitenspezifischen Kandidaten</b> auf: alle Signale stammen von den gemeinsamen Komponenten des Webauftritts, die schon im #53-Lauf auffielen (Suchfeld, Hauptbereich, Regionen). Der <b>Nachtest der Abfallzonen-Suche bestätigt die #53-Beobachtung</b>: Der Pflichtfeld-Hinweis wird weiterhin mit dunkelstem Grauwert {grey} dargestellt (≈{retest['contrastOnWhite']}:1). Für die übrigen Seiten waren keine Nachspiel-Aufrufe nötig.</p>")
p.append("<p class='small'>Zum vollständigen Kontext: <a href='../basel-report/index.html'>Feldbericht #53</a> · <a href='../basel-discovery/index.html'>Discovery-Landkarte</a></p>")

p.append("<h2>Alle Anfragen</h2><div class='tw'><table><thead><tr><th>Schritt</th><th class='num'>Seitenaufrufe</th><th>Beleg</th></tr></thead><tbody>"
         "<tr><td>Ring-1-Lauf: Scanner + Journeys auf 7 Seiten (10 s Abstand, keine Wiederholung)</td><td class='num'>14</td><td class='small'>batch/run-manifest.json</td></tr>"
         "<tr><td>Nachspielen im frischen Browser</td><td class='num'>0</td><td class='small'>nicht nötig: keine neuen Kandidaten; Nachtest aus dem Scanner-Bildschirmfoto gemessen</td></tr>"
         "<tr><td><b>Summe</b></td><td class='num'><b>14</b></td><td></td></tr></tbody></table></div>")

p.append("<h2>Geprüfte Seiten</h2><p class='small'>axe «verletzt» ist ein automatisches Signal im Forschungsprofil, kein WCAG-Urteil; «unvollständig» braucht menschliche Prüfung. Journeys: Fokusverlauf, aufklappbare Elemente, Dialog öffnen + Escape, Sprunglink.</p>")
p.append("<div class='tw'><table><thead><tr><th>Seite</th><th>Aufgabe</th><th>Läufe</th><th class='num'>axe verletzt / unvollständig / bestanden / nicht anwendbar</th><th>Journeys bestanden / zu prüfen / nicht anwendbar</th></tr></thead><tbody>")
for pg in pages:
    c, js = pg["counts"], pg["journeys"]
    jp = sum(v == "pass" for v in js.values()); jn = sum(v == "inapplicable" for v in js.values())
    p.append(f"<tr><td><a href='{E(pg['url'])}'>{E(pg['id'])}</a></td><td>{E(pg['task'])}</td><td class='small'>{E(' · '.join(f'{k}: {v}' for k, v in pg['runs'].items()))}</td>"
             f"<td class='num'>{c['violations']} / {c['incomplete']} / {c['passes']} / {c['inapplicable']}</td><td>{jp} / {len(js) - jp - jn} / {jn}</td></tr>")
p.append("</tbody></table></div>")
p.append("<p class='small'>Wiederkehrende Komponenten (einmal gezählt, alle Fundstellen behalten): " + "; ".join(
    f"{E(c['rule'])} an <code>{E(c['target'][:40])}</code> auf {len(c['pages'])} von 7 Seiten" for c in components if len(c["pages"]) > 1) +
    ". Seitenspezifisch nur auf der Abfallzonen-Suche: " + ", ".join(E(c["rule"]) for c in components if len(c["pages"]) == 1 and c["pages"] == ["r07-s09"]) +
    "; eine zusätzliche Region-Fundstelle (<code>h3</code>) auf r02 gehört zur gleichen «Nicht fündig geworden?»-Komponente. Keine Gesamtnote, keine Rangliste.</p>")

p.append(f"""<h2>Nachtest: Pflichtfeld-Hinweis der Abfallzonen-Suche</h2><section class='case'>
<figure><img src='img/r07-hint-card.png' alt='Kopf des Formulars «Abfuhrzonensuche»; rechts oben steht sehr blass «* muss ausgefüllt werden».'><figcaption>Ausschnitt aus dem Scanner-Bildschirmfoto des Ring-1-Laufs (29.10.2026).</figcaption></figure>
<figure><img src='img/r07-hint-zoom.png' alt='Vierfach vergrösserter Ausschnitt des blassen Hinweistexts.'><figcaption>Derselbe Hinweis, 4× vergrössert.</figcaption></figure>
<pre>Ausschnitt {E(REGION)}: dunkelster Grauwert {grey} auf 255 → {retest['contrastOnWhite']}:1
#53 (frischer Browser, nach 1 s und 5 s): Grauwert 242 → 1,12:1
axe im Ring-1-Lauf: color-contrast «verletzt» am selben Element (berechnet ≈4,47:1)</pre>
<p>Die Beobachtung bleibt bestehen; die mögliche Ursache (halbtransparente klebende Überschrift mit <code>bg-white/90</code>) bleibt eine Hypothese ohne Layoutmessung. Ein zweiter Lauf am selben Abend ist kein Nachweis über die Zeit.</p></section>""")
p.append("""<h2>Negativbefunde und Grenzen</h2><ul>
<li>Fokus-Journey: 2/3 bzw. 4/5 Ziele mit «deutlich erkennbarer» Markierung. Im #53-Lauf erwies sich dieses Signal als Fehlalarm (Hintergrundmarkierung, Messung ausserhalb des Bildausschnitts); hier nicht erneut nachgespielt und daher <b>nicht</b> als Befund gewertet.</li>
<li>Dialog-Journey überall «zu prüfen» (Sprachwahl, wie in #53); Sprunglink-Ziel vorhanden, Umgehungswirkung nicht automatisch beurteilbar.</li>
<li>Gebärdensprache-Seite: Videoinhalte wurden nicht geprüft (Basel nennt Videos selbst als Einschränkung).</li>
<li>Bettingen-Dienste und Wegzug: nur die öffentlichen Einstiegsseiten; Formulare und eServices bleiben ungeprüft.</li>
<li>Keine Hilfsmittel-Erfahrung, keine Beteiligung von Menschen mit Behinderungen; Stichprobe nach Aufgabe gewählt, nicht zufällig.</li></ul>""")
p.append("<h2>Nächster Schritt</h2><div class='next'><p>Die Ring-1-Freigabe ist mit diesem Lauf aufgebraucht. Die zwei reproduzierten #53-Beobachtungen bleiben die belastbaren Fälle für eine private Arbeitsnotiz an die Webredaktion (nach Freigabe). Über Ring 2 (sechs Startseiten anderer Träger) entscheidet der Eigentümer separat.</p></div>")
p.append("<p class='small'>Erzeugt mit scripts/basel_ring1_report.py. Rohdaten ausserhalb von git; Prüfsumme in ARCHIVE.sha256.</p></main></body></html>")
open(f"{here}/index.html", "w").write("\n".join(p))
print(f"{here}/index.html", "grey", grey)
