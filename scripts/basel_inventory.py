#!/usr/bin/env python3
"""Build the Basel service inventory from the discovery ledger (no network).

Usage: python3 -I scripts/basel_inventory.py <discovery_dir> <batch_queue.json> <out.json>
Observed fields come from the fetched official pages (owner line "Für dieses Thema zuständig", outgoing transaction
hosts, PDF links, language alternates); task/audience/priority are the coordinator's labels (marked "inferred").
"""
import html, json, re, sys, urllib.parse

disc, queue_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
L = json.load(open(f"{disc}/ledger.json"))
queued = {q["url"]: q["id"] for q in json.load(open(queue_path))}
TX = {"eservices.egov.bs.ch", "formulare.bs.ch", "esteuern.bs.ch", "jaxforms.cloud.bs.ch", "bussen.egov.bs.ch", "www.eumzug.swiss",
      "ed-kinderbetreuung.edubs.ch", "ekonto.egov.bs.ch", "app.draeggwaegg.ch"}
EMBED = {"geo.bs.ch", "map.geo.bs.ch"}

# (path suffix, service id, title, audience, civic task, priority, reason) - coordinator labels
LABELS = [
    ("/", "S01", "Startseite bs.ch", "alle", "Einstieg, Suche, Navigation zu Diensten", "hoch", "Gemeinsamer Einstieg aller Aufgaben"),
    ("eportal.egov.bs.ch/", "S02", "ePortal (öffentliche Startseite)", "alle", "Online-Dienste finden", "hoch", "Zweites autorisiertes Origin, JavaScript-Anwendung"),
    ("/erklaerung-zur-barrierefreiheit", "S03", "Erklärung zur Barrierefreiheit", "alle", "Barrieren melden, Stand erfahren", "mittel", "Selbstauskunft des Kantons (Kontext, keine Prüfung)"),
    ("/umzug-innerhalb-des-kantons-melden", "S04", "Umzug innerhalb des Kantons melden", "Einwohnende", "Adressänderung", "hoch", "Häufige Aufgabe, Transaktion extern (eUmzug/eServices)"),
    ("/wegzug-vom-kanton-melden", "S05", "Wegzug vom Kanton melden", "Einwohnende", "Abmeldung", "mittel", "Transaktion mit Bezahlschritt extern"),
    ("/zuzug-den-kanton-basel-stadt", "S06", "Zuzug in den Kanton", "Neuzuziehende", "Anmeldung, Begrüssungstermin", "hoch", "Erster Kontakt mit dem Kanton"),
    ("/ich-brauche-einen-neuen-pass-eine-neue-identitaetskarte", "S07", "Pass / Identitätskarte bestellen", "Einwohnende", "Identität, Termin", "hoch", "Termin über Bundesstellen; viele Absprünge"),
    ("/abfallabfuhr", "S08", "Abfallabfuhr", "Einwohnende", "Abfuhrtermine und Zone", "hoch", "Alltagsaufgabe; Karten-iFrame und PDF-Pläne"),
    ("/apps/zonensuche", "S09", "Zonensuche (App)", "Einwohnende", "Abfuhrzone zur Adresse", "mittel", "Interaktive App"),
    ("/abfall-abc", "S10", "Abfall-ABC", "Einwohnende", "Entsorgung nachschlagen", "niedrig", "Nachschlage-Verzeichnis"),
    ("/apps/sozialhilferechner", "S11", "Sozialhilferechner (App)", "Personen mit wenig Einkommen", "Anspruch abschätzen", "hoch", "Unterstützungsleistung, Formular-App"),
    ("/leistungsrechner", "S12", "Leistungsrechner (Übersicht)", "Personen mit wenig Einkommen", "Passende Leistung finden", "mittel", "Einstieg zu drei Rechnern"),
    ("/menschen-mit-behinderung", "S13", "Finanzielle Hilfe für Menschen mit Behinderung", "Menschen mit Behinderung", "Leistungen finden", "hoch", "Zielgruppe direkt betroffen"),
    ("/anwohnerparkkarte", "S14", "Anwohnerparkkarte", "Einwohnende", "Bewilligung beantragen", "mittel", "eService mit Bezahlschritt"),
    ("/behindertenparkkarte", "S15", "Behindertenparkkarte", "Menschen mit Gehbehinderung", "Bewilligung beantragen", "hoch", "Zielgruppe direkt betroffen"),
    ("/busse-bezahlen", "S16", "Busse bezahlen", "alle", "Busse begleichen", "niedrig", "Zahlung extern (bussen.egov.bs.ch)"),
    ("/online-formulare-steuerverwaltung", "S17", "Online-Formulare Steuerverwaltung", "Steuerpflichtige", "Steuerformulare und Anfragen", "hoch", "Absprung in mehrere Transaktionssysteme"),
    ("/steuerrechner", "S18", "Steuern berechnen", "Steuerpflichtige", "Steuerbelastung abschätzen", "niedrig", "Rechner teilweise extern"),
    ("/kita", "S19", "Kita", "Familien", "Kita-Platz und Beiträge", "hoch", "Viele PDFs, Fachportal"),
    ("/brauche-ich-eine-baubewilligung", "S20", "Brauche ich eine Baubewilligung?", "Einwohnende, Unternehmen", "Bewilligungspflicht klären", "mittel", "Formular-Dienst extern (jaxforms)"),
    ("/gruendung-ansiedlung-von-firmen", "S21", "Gründung & Ansiedlung von Firmen", "Unternehmen", "Firma gründen", "mittel", "Unternehmensaufgabe"),
    ("/erstmaliger-stellenantritt-der-schweiz", "S22", "Erstmaliger Stellenantritt (Arbeitsbewilligung)", "Arbeitgebende, Arbeitnehmende", "Arbeitsbewilligung", "mittel", "Unternehmens- und Migrationsaufgabe"),
    ("/gebaerdensprache", "S23", "Inhalte in Gebärdensprache", "gehörlose Menschen", "Informationen in Gebärdensprache", "mittel", "Barrierefreie Kommunikation, Videos"),
    ("/kinderbetreuung", "S24", "Kinderbetreuung (Übersicht)", "Familien", "Betreuung finden", "niedrig", "Themenseite"),
    ("/steuererklaerung", "S25", "Steuererklärung (Übersicht)", "Steuerpflichtige", "Steuererklärung einreichen", "mittel", "Themenseite, BalTax"),
]

def text_of(path):
    s = open(path, encoding="utf-8", errors="replace").read()
    m = re.search(r"<main.*?</main>", s, re.S)
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", m.group(0) if m else s, flags=re.S)
    return s, " ".join(html.unescape(re.sub(r"<[^>]+>", " ", body)).split())

entries = []
for suffix, sid, title, audience, task, prio, reason in LABELS:
    page = next((f for f in L["fetched"] if f.get("file") and (f["url"].endswith(suffix) or f["url"].split("://")[1] == suffix)), None)
    if not page:
        continue
    raw, txt = text_of(f"{disc}/html/{page['file']}")
    owner = re.search(r"Für dieses Thema zuständig\s+(.{3,90}?)\s+Inhalt aktualisiert", txt)
    hosts = sorted({urllib.parse.urlsplit(l["href"]).netloc for l in page.get("links", [])})
    tx = sorted({l["href"].split("?")[0][:120] for l in page.get("links", []) if urllib.parse.urlsplit(l["href"]).netloc in TX - {"ekonto.egov.bs.ch"}})
    pdfs = sum(1 for l in page.get("links", []) if "media.bs.ch/original_file" in l["href"] or l["href"].lower().endswith(".pdf"))
    entries.append({
        "serviceId": sid, "title": title, "audience": audience, "civicTask": task, "entryUrl": page["url"],
        "transactionUrls": tx,
        "responsibility": "unknown", "responsibilityNote": "Zuordnung Stadt/Kanton/Gemeinde nicht aus einer offiziellen Quelle belegt (siehe Bericht); Riehen/Bettingen nur als Kontext.",
        "operator": owner.group(1).strip() if owner else None, "operatorSource": page["url"] if owner else None,
        "operatorConfidence": "observed (Seitenangabe «Für dieses Thema zuständig»)" if owner else "unknown",
        "boundary": {"public": True, "loginOrAccount": "ekonto.egov.bs.ch" in hosts or any("eservices" in t for t in tx),
                     "thirdPartyHosts": sorted(h for h in hosts if h in {"www.eumzug.swiss", "app.draeggwaegg.ch", "trashcal.maxgfeller.com"}),
                     "transactionHosts": sorted(h for h in hosts if h in TX - {"ekonto.egov.bs.ch"}),
                     "embeddedOrMapHosts": sorted(h for h in hosts if h in EMBED), "pdfLinks": pdfs},
        "languages": sorted(set(re.findall(r'hreflang="([a-zA-Z-]+)"', raw))) or ["de (nur Deutsch beobachtet)"],
        "interface": "JavaScript-Anwendung" if "eportal" in page["url"] else "App/Formular" if "/apps/" in page["url"] else "Informations-/Einstiegsseite",
        "provenance": {"url": page["url"], "retrievedAt": page["at"], "sha256": page["sha256"], "status": page["status"]},
        "accessibilityDisclosure": "Erklärung zur Barrierefreiheit (bs.ch): teilweise konform; PDFs, Videos, iFrames als Einschränkungen genannt" if (pdfs or "iframe" in raw.lower()) else None,
        "priority": prio, "priorityReason": reason,
        "status": {"discovered": True, "queuedForAssessment": page["url"] in queued, "assessmentId": queued.get(page["url"])},
        "exclusionReason": None if page["url"] in queued else "nicht in die 12 Bewertungsseiten aufgenommen (Stichprobe nach Aufgabe und Seitentyp)",
        "labels": {"observed": ["entryUrl", "transactionUrls", "operator", "boundary", "languages", "provenance"], "inferred": ["audience", "civicTask", "priority", "interface"]},
    })

future = sorted({h for e in entries for h in e["boundary"]["transactionHosts"] + e["boundary"]["thirdPartyHosts"] + e["boundary"]["embeddedOrMapHosts"]})
json.dump({"schema": "art/basel-service-inventory/v1", "note": "Nicht vollständig. Stichprobe aus offizieller Navigation (bs.ch, Tiefe ≤2). Kein Login, keine Formulare.",
           "entries": entries, "futureQueueHosts": [{"host": h, "status": "nicht getestet: anderes Origin, nicht autorisiert"} for h in future]},
          open(out, "w"), indent=1, ensure_ascii=False)
print(len(entries), "entries;", len(future), "future hosts; owners observed:", sum(1 for e in entries if e["operator"]))
