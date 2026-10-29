#!/usr/bin/env python3
"""Render the German Basel field report (self-contained HTML) and a small results extract, from the field artifacts.

Usage: python3 -I scripts/basel_report.py <batch_dir> <repro_json> [<repro_json> ...]
Writes docs/experiments/basel-report/index.html and field-results.json (counts only; raw evidence stays outside git).
"""
import collections, glob, html, json, os, sys

batch, repro_paths = sys.argv[1], sys.argv[2:]
here = "docs/experiments/basel-report"
E = html.escape
inv = json.load(open(f"{here}/service-inventory.json"))
queue = json.load(open(f"{here}/batch-queue.json"))
manifest = json.load(open(f"{batch}/run-manifest.json"))
repro = [r for p in repro_paths for r in json.load(open(p))["results"]]
progress = open(f"{here}/progress/progress.html").read()
meas = json.load(open(f"{here}/measurements.json"))
yn = lambda v: "ja" if v is True else "nein" if v is False else "–" if v is None else str(v)

pages, occurrences = [], collections.defaultdict(set)
for q in queue:
    d = f"{batch}/{q['id']}"
    summ = json.load(open(f"{d}/scan/summary.json"))
    probes = json.load(open(f"{d}/scan/probe-results.json"))
    journeys = json.load(open(f"{d}/journey/journey-results.json"))["results"]
    for r in probes:
        if r["outcome"] == "violation":
            for n in r["nodes"]:
                occurrences[(r["probeId"], " ".join(n["target"]) if isinstance(n["target"], list) else str(n["target"]))].add(q["id"])
    run = next(p for p in manifest["pages"] if p["id"] == q["id"])
    pages.append({"id": q["id"], "url": q["url"], "task": q["task"], "interface": q["interface"], "finalUrl": summ["finalUrl"], "counts": summ["counts"],
                  "runs": {r["tool"]: r["status"] for r in run["runs"]},
                  "journeys": {j["journeyId"]: j["outcome"] for j in journeys}})
components = sorted(({"rule": k[0], "target": k[1], "pages": sorted(v)} for k, v in occurrences.items()), key=lambda c: -len(c["pages"]))
json.dump({"schema": "art/basel-field-results/v1", "codeSha": manifest["codeSha"], "startedAt": manifest["startedAt"], "wallSeconds": manifest.get("wallSeconds"),
           "pages": pages, "violationComponents": components}, open(f"{here}/field-results.json", "w"), indent=1, ensure_ascii=False)

def rep(case):
    return next(r for r in repro if r["case"] == case)
kb, search, hint, hint5 = rep("keyboard-first-tabs"), rep("search-field-semantics"), rep("required-hint-contrast"), rep("required-hint-opacity")
search_pages = next(c["pages"] for c in components if c["target"] == "#searchinput")

css = """
:root{--bg:#fbfbf9;--fg:#1c1d1f;--muted:#5d6168;--line:#d9dad6;--card:#fff;--ok:#1d6b3a;--bad:#a1261e;--warn:#8a5a00;--accent:#2b4fa3}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#141517;--fg:#e8e8e6;--muted:#a3a7ad;--line:#33363b;--card:#1c1e21;--ok:#6fcf8e;--bad:#f08a80;--warn:#e3b45a;--accent:#8fb0ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1080px;margin:0 auto;padding:24px 16px 64px}h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.2rem;margin:36px 0 8px;border-top:1px solid var(--line);padding-top:20px}h3{font-size:1rem;margin:18px 0 6px}
.lead,.small{color:var(--muted)}.small{font-size:.82rem}.tag{display:inline-block;border:1px solid var(--line);border-radius:4px;padding:0 6px;font-size:.8rem;color:var(--muted);margin:0 4px 4px 0}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--card)}table{border-collapse:collapse;width:100%;font-size:.85rem}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{background:color-mix(in srgb,var(--line) 35%,transparent)}
.num{text-align:right;font-variant-numeric:tabular-nums}.ok{color:var(--ok)}.bad{color:var(--bad);font-weight:600}.warn{color:var(--warn)}
.case{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin:16px 0}figure{margin:10px 0}figure img{max-width:100%;border:1px solid var(--line);border-radius:4px}figcaption{font-size:.8rem;color:var(--muted)}
pre{background:color-mix(in srgb,var(--line) 30%,transparent);padding:8px;border-radius:4px;overflow-x:auto;font-size:.8rem}ul{padding-left:20px}.next{border-left:4px solid var(--accent);padding:8px 14px;background:var(--card)}
a{color:var(--accent)}a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
"""
p = [f"<!doctype html><html lang='de'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Basel Feldbericht</title><style>{css}</style></head><body><main>"]
p.append("<h1>Basel-Stadt: öffentliche Dienste – Feldbericht und Partner-Pilot</h1>")
p.append(f"<p class='lead'>Privater Arbeitsbericht zur Durchsicht durch den Eigentümer, Stand 29.10.2026. Keine Veröffentlichung, keine Freigabe, keine Konformitätsaussage. Feldlauf: Code <code>{E(manifest['codeSha'][:8])}</code>, {len(pages)} Seiten, {manifest.get('wallSeconds')} s.</p>")
p.append("<p>" + "".join(f"<span class='tag'>{t}</span>" for t in ["nur öffentliche Seiten", "www.bs.ch und eportal.egov.bs.ch", "kein Login, keine Formulare", "deterministische Werkzeuge", "keine Modellaufrufe im Feld", "Mistral gesamt unverändert 0,073 von 5 USD"]) + "</p>")
p.append("<p><b>Kurz:</b> 25 öffentliche Dienste aus der offiziellen Navigation inventarisiert (Tiefe ≤2, 32 von 40 erlaubten Dokumenten), 12 davon nach Aufgabe und Seitentyp ausgewählt und mit dem bestehenden Produktions-Scanner sowie sicheren Tastatur-Journeys geprüft (24 von 24 Läufen abgeschlossen). "
         "Zwei Beobachtungen wurden in einem frischen Browser reproduziert: ein <b>Hinweistext im Formular der Abfallzonen-Suche, der praktisch unsichtbar dargestellt wird</b> (gerenderter Kontrast etwa 1,1:1), und eine <b>unpassende ARIA-Auszeichnung des seitenweiten Suchfelds</b> (auf 9 von 12 Seiten). "
         "Ein dritter Kandidat – fehlende Fokusmarkierung – erwies sich beim Nachspielen als <b>Fehlalarm unseres eigenen Werkzeugs</b>. Die eigentlichen Transaktionen (eServices, Formulare, eUmzug, Steuern) liegen auf anderen Hosts und wurden bewusst nicht geprüft.</p>")

p.append(progress)

p.append("<h2>Basel: Dienstlandschaft (Stichprobe, nicht vollständig)</h2>")
p.append("<p class='small'>Quelle: offizielle Navigation von www.bs.ch und ePortal, abgerufen am 29.10.2026 (robots.txt beachtet: Crawl-delay 10 s). «Beobachtet» = auf der Seite gefunden; Aufgabe, Zielgruppe und Priorität sind unsere Einordnung. Die Zuordnung Stadt/Kanton/Gemeinde ist nicht aus einer offiziellen Quelle belegt und bleibt «unbekannt»; Riehen und Bettingen sind nur Kontext. Die Erklärung zur Barrierefreiheit ist eine Selbstauskunft des Kantons (teilweise konform; PDFs, Videos, iFrames, Leichte Sprache genannt), keine Prüfung durch uns.</p>")
p.append("<div class='tw'><table><thead><tr><th>ID</th><th>Dienst</th><th>Aufgabe / Zielgruppe</th><th>Zuständig (Seitenangabe)</th><th>Transaktion auf anderem Host</th><th class='num'>PDF-Links</th><th>Priorität</th><th>Geprüft</th></tr></thead><tbody>")
for e in inv["entries"]:
    tx = ", ".join(sorted(set(e["boundary"]["transactionHosts"] + e["boundary"]["thirdPartyHosts"]))) or "–"
    p.append(f"<tr><td>{e['serviceId']}</td><td><a href='{E(e['entryUrl'])}'>{E(e['title'])}</a></td><td>{E(e['civicTask'])} · {E(e['audience'])}</td><td>{E(e['operator'] or 'unbekannt')}</td><td class='small'>{E(tx)}</td><td class='num'>{e['boundary']['pdfLinks']}</td><td>{E(e['priority'])}</td><td>{E(e['status']['assessmentId'] or 'nein')}</td></tr>")
p.append("</tbody></table></div>")
p.append("<p class='small'>Nicht geprüfte Hosts (künftige Warteschlange, eigene Freigabe nötig): " + ", ".join(E(h["host"]) for h in inv["futureQueueHosts"]) + ". Der ePortal-Link der Startseite führt auf ekonto.egov.bs.ch (Anmeldung) und wurde nicht aufgerufen.</p>")

p.append("<h2>Geprüfte Stichprobe (12 Seiten, 29.10.2026)</h2>")
p.append("<p class='small'>Werkzeuge: Produktions-Scanner (axe-core 4.13, ganzseitiger Screenshot, Coverage) und sichere Tastatur-Journeys (Fokusverlauf, aufklappbare Elemente, Dialog öffnen und Escape, Sprunglink; keine Formulare, keine Absende-Elemente). Chromium, Ansicht 1440×900, ein Seitenaufruf je Werkzeug, mindestens 10 s Abstand, keine Wiederholung. Unterressourcen wurden wie in einem normalen Browser geladen; andere Hosts wurden nicht geprüft. axe «verletzt» ist ein automatisches Signal im Forschungsprofil, kein WCAG-Urteil; «unvollständig» braucht menschliche Prüfung.</p>")
p.append("<div class='tw'><table><thead><tr><th>Seite</th><th>Aufgabe</th><th>Läufe</th><th class='num'>axe verletzt / unvollständig / bestanden / nicht anwendbar</th><th>Journeys bestanden / zu prüfen / nicht anwendbar</th></tr></thead><tbody>")
for pg in pages:
    c = pg["counts"]; js = pg["journeys"]
    jp = sum(1 for v in js.values() if v == "pass"); jn = sum(1 for v in js.values() if v == "inapplicable"); ji = len(js) - jp - jn
    runs = " · ".join(f"{k}: {v}" for k, v in pg["runs"].items())
    p.append(f"<tr><td><a href='{E(pg['url'])}'>{E(pg['id'])}</a><div class='small'>{E(pg['interface'])}{(" · gelandet auf " + E(pg['finalUrl'].split(".ch",1)[1]) + " (gleiches Origin; ob Weiterleitung oder Anwendungsroute, wurde nicht festgehalten)") if pg['finalUrl'].rstrip('/') != pg['url'].rstrip('/') else ""}</div></td><td>{E(pg['task'])}</td><td class='small'>{E(runs)}</td><td class='num'>{c['violations']} / {c['incomplete']} / {c['passes']} / {c['inapplicable']}</td><td>{jp} / {ji} / {jn}</td></tr>")
p.append("</tbody></table></div>")
p.append("<p class='small'>Wiederkehrende Komponenten (gleiches Element auf mehreren Seiten, einmal gezählt, alle Fundstellen behalten): " + "; ".join(f"{E(c['rule'])} an <code>{E(c['target'][:40])}</code> auf {len(c['pages'])} Seiten" for c in components if len(c["pages"]) > 1) + ". Keine Gesamtnote, keine Rangliste, keine Hochrechnung auf den ganzen Webauftritt.</p>")

p.append("<h2>Reproduzierte Beobachtungen</h2><p class='small'>Jede Beobachtung wurde nach dem Feldlauf in einem frischen Browser-Kontext nachgespielt (nur Laden, Tab-Taste, Attribute lesen; keine Eingabe). Die Behebungsvorschläge sind Hypothesen; nichts wurde an den Seiten verändert.</p>")
h = hint["observed"]["element"]; ch = hint5["observed"]["chain"]
p.append(f"""<section class='case'><h3>Fall 1 · Hinweis «* muss ausgefüllt werden» in der Abfallzonen-Suche ist praktisch unsichtbar</h3>
<p><b>Aufgabe:</b> Abfuhrzone zur eigenen Adresse finden (Formular-App <a href='{E(hint['url'])}'>/apps/zonensuche</a>). <b>Zuständig:</b> unbekannt (keine Seitenangabe; Abfallabfuhr: Tiefbauamt).</p>
<figure><img src='img/c2-hint-card.png' alt='Kopf des Formulars «Abfuhrzonensuche»; rechts oben steht sehr blass «* muss ausgefüllt werden».'><figcaption>Echter Bildschirmausschnitt nach 5 s (frischer Browser, 29.10.2026). Der Hinweis rechts oben ist kaum zu sehen.</figcaption></figure>
<figure><img src='img/c2-hint-zoom.png' alt='Vierfach vergrösserter Ausschnitt des blassen Hinweistexts.'><figcaption>Derselbe Hinweis, 4× vergrössert.</figcaption></figure>
<pre>Berechnete CSS-Farbe: {E(h['color'])} auf {E(h['background'])}, {E(h['fontSize'])}, Gewicht {E(h['fontWeight'])} → {h['contrast']}:1 (axe: 4,47:1; verlangt 4,5:1)
Dargestellte Pixel (gemessen mit scripts/basel_pixel_measure.py, Ausschnitt {E(meas['after1s']['region'])}):
  nach 1 s: dunkelster Grauwert {meas['after1s']['darkestGrey']} auf 255 → {meas['after1s']['contrastOnWhite']}:1
  nach 5 s: dunkelster Grauwert {meas['after5s']['darkestGrey']} auf 255 → {meas['after5s']['contrastOnWhite']}:1
Deckkraft aller Elternelemente nach 5 s: {ch['effectiveOpacity']} (kein Übergang)
Mögliche Ursache (Hypothese): {E(meas['overlayHypothesis']['element'])} mit 90 % weissem Hintergrund liegt über dem Hinweis;
  0,1·119 + 0,9·255 ≈ {meas['overlayHypothesis']['predictedGrey']} (gemessen {meas['after5s']['darkestGrey']}). {E(meas['overlayHypothesis']['status'])}.</pre>
<ul><li><b>Beobachtete Folge:</b> Der Hinweis, dass ein Feld Pflicht ist, ist für sehende Personen mit eingeschränktem Kontrastsehen praktisch nicht lesbar.</li>
<li><b>Nachspielen:</b> Seite laden, 5 s warten, Bereich «Abfuhrzonensuche» ansehen; in den Entwicklerwerkzeugen die tatsächlich gerenderte Farbe prüfen.</li>
<li><b>Behebungshypothese:</b> prüfen, ob die klebende Überschrift den Hinweis überdeckt (Ebene/Position anpassen), und den Hinweis mindestens im Kontrast 4,5:1 darstellen.</li>
<li><b>Selbstauskunft Basel:</b> «Die Kontrastverhältnisse entsprechen den Vorgaben.» Diese Einzelbeobachtung steht dazu im Widerspruch; sie ist keine Aussage über den ganzen Webauftritt.</li>
<li><b>Noch offen:</b> Bestätigung der Ursache durch Layoutmessung; ob der Pflichtfeld-Hinweis anders vermittelt wird (z. B. am Feld selbst «Adresse: *»).</li></ul></section>""")
a = search["observed"]["attributes"]
p.append(f"""<section class='case'><h3>Fall 2 · Seitenweites Suchfeld: ARIA-Auszeichnung passt nicht zur Rolle</h3>
<p><b>Aufgabe:</b> über die Suche einen Dienst finden (Kopfbereich; dieses axe-Signal auf {len(search_pages)} von 12 geprüften Seiten). <b>Zuständig:</b> unbekannt (gemeinsame Vorlage des Webauftritts).</p>
<figure><img src='img/c1-header-search.png' alt='Kopfzeile von bs.ch mit Logo, Themen, Organisation, Sprachwahl DE, ePortal und Lupen-Schaltfläche für die Suche.'><figcaption>Kopfzeile mit der Such-Schaltfläche (Lupe rechts). Ein Bild kann ARIA nicht zeigen; der Beleg ist der DOM-Auszug unten.</figcaption></figure>
<pre>&lt;input id="searchinput" type="{E(a['attributes'].get('type',''))}"
  aria-label="{E(a['attributes'].get('aria-label',''))}" aria-autocomplete="{E(a['attributes'].get('aria-autocomplete',''))}"
  aria-expanded="{E(a['attributes'].get('aria-expanded',''))}" aria-controls="{E(a['attributes'].get('aria-controls',''))}"&gt;
Vom Browser ausgegebene Rolle: {E(search['observed']['ariaSnapshot'] or '')}
Element mit id «{E(a['attributes'].get('aria-controls',''))}» beim Laden vorhanden: {'ja' if a['controlledElementExists'] else 'nein'}
axe: aria-allowed-attr («aria-expanded» ist für ein Suchfeld nicht erlaubt), auf {len(search_pages)} Seiten</pre>
<ul><li><b>Beobachtete Folge (technisch):</b> Das Feld wird als «searchbox» ausgegeben, trägt aber Attribute eines Kombinationsfelds (Vorschlagsliste); die referenzierte Vorschlagsliste existiert beim Laden nicht.</li>
<li><b>Mögliche Folge für Nutzende (Hypothese):</b> Screenreader kündigen Vorschläge eventuell nicht oder uneinheitlich an. Das muss mit Hilfsmitteln (Screenreader) geprüft werden.</li>
<li><b>Behebungshypothese:</b> entweder das Muster «combobox» vollständig umsetzen (role, aria-expanded, Liste im DOM) oder die Kombinationsfeld-Attribute entfernen.</li>
<li><b>Selbstauskunft Basel:</b> Diese Fehlerklasse wird nicht genannt (genannt sind PDFs, Videos, iFrames).</li></ul></section>""")
steps = kb["observed"]["steps"]
p.append(f"""<section class='case'><h3>Negativbefund · «Fokus nicht sichtbar» war ein Fehlalarm unseres Werkzeugs</h3>
<p>Der Fokus-Journey meldete auf mehreren Seiten «0/3 bzw. 2/5 Fokusziele mit deutlich erkennbarer Markierung». Nachgespielt wurde nur die Seite «Umzug melden» (0/3); für die übrigen Seiten ist der Fehlalarm wahrscheinlich, aber nicht einzeln geprüft:</p>
<figure><img src='img/n1-tab1-banner.png' alt='Cookie-Hinweis unten auf der Seite; der Link «Datenschutzerklärung» ist mit hellem Hintergrund markiert.'><figcaption>Erster Tab: Fokus im Cookie-Hinweis auf «Datenschutzerklärung», sichtbar durch Hintergrundmarkierung (ohne Umrandung).</figcaption></figure>
<figure><img src='img/n1-tab2-banner.png' alt='Cookie-Hinweis; die Schaltfläche «Weiter mit allen Cookies» ist violett mit dicker Umrandung hervorgehoben.'><figcaption>Zweiter Tab: «Weiter mit allen Cookies» mit deutlicher Umrandung.</figcaption></figure>
<pre>{E(chr(10).join(f"{s['press']}: {s['focus'].get('tag')} «{s['focus'].get('text','')}» · im Bild: {yn(s['focus'].get('inViewport'))} · Umrandung: {s['focus'].get('outline','–')} · im Cookie-Hinweis: {yn(s['focus'].get('insideConsentBanner'))}" for s in steps))}</pre>
<p><b>Lehre:</b> Unsere Heuristik erkennt nur Umrandung oder Schatten und mass den Cookie-Hinweis im Feldlauf ausserhalb des Bildausschnitts. Die Markierung ist vorhanden. Das ist eine Verbesserung für unser Werkzeug, kein Befund zu Basel. Beobachtet, aber nicht bewertet: Die ersten Tab-Schritte führen in den Cookie-Hinweis; der vierte verlässt die Seite. Ob der Hinweis den übrigen Inhalt bewusst sperrt, wäre mit Tastatur- und Screenreader-Nutzenden zu klären.</p></section>""")

p.append("""<h2>Alle Anfragen an die öffentlichen Seiten</h2><p class='small'>Vollständige Zählung der Seitenaufrufe auf www.bs.ch und eportal.egov.bs.ch (Unterressourcen der Seiten nicht mitgezählt). Kein anderer Host wurde aufgerufen; keiner Weiterleitung auf einen anderen Host gefolgt, keine Wiederholung, kein Formular.</p>
<div class='tw'><table><thead><tr><th>Schritt</th><th class='num'>Aufrufe</th><th>Beleg</th></tr></thead><tbody>
<tr><td>robots.txt beider Origins (vor der Entdeckung, von Hand mit curl)</td><td class='num'>2</td><td class='small'>discovery/robots-*.txt (ePortal-Datei leer)</td></tr>
<tr><td>Entdeckung (HTML, Tiefe ≤2, je 10 s Abstand)</td><td class='num'>32</td><td class='small'>discovery/ledger.json</td></tr>
<tr><td>Feldlauf: Scanner + Journeys auf 12 Seiten</td><td class='num'>24</td><td class='small'>batch/run-manifest.json</td></tr>
<tr><td>Nachspielen im frischen Browser (aufgezeichnet)</td><td class='num'>4</td><td class='small'>repro-03507ff/repro.json (3), repro-cbcd355/repro.json (1)</td></tr>
<tr><td>Nachspielen, zwei fehlgeschlagene Versuche (Skriptfehler nach dem Laden der Seite «Umzug melden»; damals nicht aufgezeichnet, Skript seither korrigiert)</td><td class='num'>2</td><td class='small'>dieser Bericht</td></tr>
<tr><td><b>Summe</b></td><td class='num'><b>64</b></td><td></td></tr></tbody></table></div>
<p class='small'>Alle Werkzeugläufe endeten ohne Abbruch (24/24 «ok»).</p>""")
p.append("""<h2>Grenzen dieser Stichprobe</h2><ul>
<li>12 Einstiegs- und Informationsseiten, keine Transaktion: eServices, Formulare, eUmzug, eSteuern, Karten und PDFs liegen auf anderen Hosts oder hinter Anmeldung und wurden nicht geprüft.</li>
<li>Automatische Prüfungen finden nur einen Teil der Barrieren; «unvollständig» (Kontrast auf 12 Seiten, Dialog-Fokus auf 11 Seiten) braucht menschliche Prüfung.</li>
<li>Keine Erfahrung mit Screenreader oder anderen Hilfsmitteln; keine Beteiligung von Menschen mit Behinderungen.</li>
<li>Die Stichprobe ist nach Aufgabe gewählt, nicht zufällig; Ähnlichkeit der Vorlage beweist kein gleiches Verhalten auf anderen Seiten.</li></ul>""")
p.append("""<h2>Ausblick</h2><ul>
<li><b>Prozess und Evidenz:</b> Fokus-Heuristik um Hintergrund- und Farbmarkierung erweitern und vor der Messung in den Bildausschnitt scrollen (heute Fehlalarm); gerenderten Kontrast aus Pixeln zusätzlich zur CSS-Berechnung messen (Fall 1 zeigt den Unterschied).</li>
<li><b>Nützliche Modellrollen:</b> Modelle nicht als Detektor (siehe A/B/C/M); höchstens als Formulierungs- oder Triagehilfe mit Belegzitaten, getrennt von verifizierten Beobachtungen. In diesem Feldlauf wurden keine Modelle verwendet.</li>
<li><b>Partner und Hilfsmittel:</b> Die beiden reproduzierten Beobachtungen und alle «unvollständig»-Signale gemeinsam mit einer Fachperson und Hilfsmittel-Nutzenden prüfen, bevor daraus Aussagen werden.</li></ul>""")
p.append("""<h2>Nächster Schritt und Vorschlag für einen kleinen Partner-Pilot</h2><div class='next'>
<p><b>Nächster Schritt:</b> Die zwei reproduzierten Beobachtungen der Webredaktion Basel-Stadt (Kontakt laut Erklärung zur Barrierefreiheit) als private Arbeitsnotiz vorlegen – nur nach Freigabe durch den Eigentümer, ohne Veröffentlichung.</p>
<p><b>Pilot-Vorschlag (Entwurf, nichts vereinbart):</b></p><ul>
<li><b>Aufgabe:</b> «Umzug innerhalb des Kantons melden» von der Informationsseite bis zum Ende des öffentlichen Teils, plus die Abfallzonen-Suche als kleine Formular-App.</li>
<li><b>Verantwortlich:</b> Einwohneramt (laut Seitenangabe) für den Umzug, Webredaktion für Vorlage und Suche; Zuständigkeit für eServices/eUmzug zu klären.</li>
<li><b>Fachliche Prüfung:</b> eine Fachperson Barrierefreiheit und mindestens zwei Hilfsmittel-Nutzende (Screenreader, Tastatur) bestätigen oder verwerfen jede Beobachtung.</li>
<li><b>Wiederholbarer Nachtest:</b> derselbe eingefrorene Lauf (gleiche Seiten, Werkzeuge, Abstände) vor und nach einer allfälligen Änderung; nur ein vergleichbarer Nachtest gilt als «behoben».</li>
<li><b>Nützliches Ergebnis:</b> eine kurze, belegte Liste je Aufgabe (Bildschirmfoto, DOM/Fokus-Beleg, Schritte, Hypothese), die die Webredaktion in ihren bestehenden Review-Prozess übernehmen kann – ergänzend zum Aktionsplan 2025–2028, nicht als Bewertung.</li></ul>
<p class='small'>Keine Zusage, kein Auftrag, keine Unterstützung durch Basel-Stadt impliziert. Die Transaktions-Hosts bräuchten eine eigene, ausdrückliche Freigabe.</p></div>""")
p.append(f"<p class='small'>Erzeugt mit scripts/basel_report.py. Rohdaten (HTML, Scans, Journeys, Bildschirmfotos) ausserhalb von git; Prüfsummen in ARCHIVE.sha256. Bildschirmfotos zeigen öffentliche Seiten ohne Personendaten.</p></main></body></html>")
open(f"{here}/index.html", "w").write("\n".join(p))
print(f"{here}/index.html")
