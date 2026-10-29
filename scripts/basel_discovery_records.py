#!/usr/bin/env python3
"""Write the sourced Basel discovery records (organisations, web properties, edges, batch proposal) into discovery-data.json.

Usage: python3 -I scripts/basel_discovery_records.py <discovery_store> <field53_discovery_store>
Every edge cites a page fetched in the bounded discovery (retrievedAt from that ledger) or the #53 discovery ledger.
Leads that were not fetched are marked confidence "low" and say so. Nothing here is inferred from a domain name or logo.
Then run scripts/basel_discovery_build.py to validate and embed.
"""
import json, sys

store, store53 = sys.argv[1], sys.argv[2]
P = "docs/experiments/basel-discovery/discovery-data.json"
L = json.load(open(f"{store}/ledger.json")); L53 = json.load(open(f"{store53}/ledger.json"))
at = {f["url"]: f["at"] for f in L["fetched"] + L53["fetched"]}

ORG_PAGE, IMPRESSUM, BB = "https://www.bs.ch/organisation", "https://www.bs.ch/impressum", "https://media.bs.ch/original_file/4a2245c56aa3f5b4558440ac5a7bc87ccdbfc911/beteiligungsbericht-2024.pdf"
BB_DATE = "2024-12-31"  # report on holdings as of 31.12.2024

def ev(url, support, conf="high", date=None):
    return {"url": url, "support": support, "retrievedAt": at.get(url, "nicht abgerufen (Hinweis aus Plan/Websuche)"), "sourceDate": date, "confidence": conf}

orgs, props, edges = [], [], []
def org(id, name, area, type, sponsorship, legal=None, note=None, parent=None, owned=False):
    orgs.append({"id": id, "name": name, "area": area, "type": type, "legalForm": legal, "sponsorship": sponsorship, "sponsorshipNote": note,
                 "parentId": parent, "status": {"discovered": True, "ownershipEvidenced": owned}})
def prop(id, origin, name, kind, canonical=None, alternates=(), login=False, authorized=False, hist=(), out=False, owned=False, fetched=False):
    props.append({"id": id, "origin": origin, "canonicalUrl": canonical or origin + "/", "alternates": list(alternates), "name": name, "kind": kind,
                  "status": {"discovered": True, "ownershipEvidenced": owned, "selected": False, "assessed": bool(hist), "outOfScope": out, "loginBoundary": login,
                             "visitedInDiscovery": fetched},
                  "assessmentAuthorized": authorized, "historicalAssessmentIds": list(hist)})
n = [0]
def edge(frm, to, rel, *evidence):
    n[0] += 1; edges.append({"id": f"e-{n[0]:03d}", "from": frm, "to": to, "relation": rel, "evidence": list(evidence)})

# --- canton, government, departments (bs.ch/organisation, 29.10.2026)
org("org-kanton-bs", "Kanton Basel-Stadt", "verwaltung", "canton_unit", "canton_unit", owned=True)
org("org-regierungsrat", "Regierungsrat", "verwaltung", "canton_unit", "canton_unit", parent="org-kanton-bs", owned=True)
edge("org-kanton-bs", "org-regierungsrat", "parent_of", ev("https://www.bs.ch/regierungsrat/aufgaben-und-kompetenzen-des-regierungsrates", "«Gemäss dem Organisationsgesetz ist der Regierungsrat die oberste leitende und vollziehende Behörde des Kantons.»"))
DEPTS = [("pd", "Präsidialdepartement"), ("bvd", "Bau- und Verkehrsdepartement"), ("ed", "Erziehungsdepartement"), ("fd", "Finanzdepartement"),
         ("gd", "Gesundheitsdepartement"), ("jsd", "Justiz- und Sicherheitsdepartement"), ("wsu", "Departement für Wirtschaft, Soziales und Umwelt")]
for code, name in DEPTS:
    org(f"org-{code}", name, "verwaltung", "canton_unit", "canton_unit", parent="org-regierungsrat", owned=True)
    edge("org-regierungsrat", f"org-{code}", "parent_of", ev(ORG_PAGE, f"Kantonale Organisationsseite führt «{name}» unter «Verwaltung».", "medium"))
OFFICES = [("bdm", "Bevölkerungsdienste und Migration", "jsd"), ("einwohneramt", "Einwohneramt", None), ("passamt", "Passamt", None),
           ("kapo", "Kantonspolizei", "jsd"), ("tiefbauamt", "Tiefbauamt", "bvd"), ("bgi", "Bau- und Gastgewerbeinspektorat", "bvd"),
           ("steuerverwaltung", "Steuerverwaltung", "fd"), ("itbs", "IT BS", "fd"), ("awa", "Amt für Wirtschaft und Arbeit", "wsu"),
           ("asb", "Amt für Sozialbeiträge", "wsu"), ("jfs", "Jugend, Familie und Sport", "ed"), ("webredaktion", "Webredaktion bs.ch", None)]
for code, name, parent in OFFICES:
    org(f"org-{code}", name, "verwaltung", "canton_unit", "canton_unit" if parent else "unknown", parent=f"org-{parent}" if parent else None, owned=bool(parent),
        note=None if parent else "Übergeordnete Stelle in dieser Runde nicht belegt.")
    if parent:
        edge(f"org-{parent}", f"org-{code}", "parent_of", ev(ORG_PAGE, f"Kantonale Organisationsseite führt «{name}» unter dem Departement.", "medium"))
org("org-grosser-rat", "Grosser Rat (Legislative)", "politik", "parliament", "canton_unit", parent="org-kanton-bs", owned=True)
org("org-gerichte", "Gerichte Basel-Stadt (Judikative)", "politik", "judiciary", "canton_unit", parent="org-kanton-bs", owned=True)
for o, label in (("org-grosser-rat", "Grosser Rat, Legislative"), ("org-gerichte", "Gerichte, Judikative")):
    edge("org-kanton-bs", o, "parent_of", ev(ORG_PAGE, f"Unter «Staatspolitische Organe im Kanton Basel-Stadt»: «{label}».", "medium"))
for oid, name in (("org-datenschutz", "Datenschutzbeauftragte"), ("org-ombudsstelle", "Ombudsstelle"), ("org-finanzkontrolle", "Finanzkontrolle")):
    org(oid, name, "politik", "canton_unit", "canton_unit", parent="org-kanton-bs", owned=True)
    edge("org-kanton-bs", oid, "parent_of", ev(ORG_PAGE, f"Unter «Unabhängige Stellen»: «{name}».", "medium"))

# --- municipalities and Bürgergemeinden
org("org-stadt-basel", "Einwohnergemeinde der Stadt Basel", "gemeinden", "municipality", "unknown",
    note="Verhältnis zu den Kantonsbehörden in dieser Runde nicht aus einer Primärquelle belegt; Dienste der Stadt erscheinen auf www.bs.ch.")
org("org-riehen", "Einwohnergemeinde Riehen", "gemeinden", "municipality", "unknown", note="Eigene Gemeinde; Trägerschaft des Webauftritts siehe Kanten.")
org("org-bettingen", "Einwohnergemeinde Bettingen", "gemeinden", "municipality", "unknown", note="Eigene Gemeinde; Webauftritt liegt auf www.bs.ch.")
edge("org-kanton-bs", "org-riehen", "jurisdiction_over", ev("https://www.bs.ch/bettingen/gemeinde", "«Bettingen ist neben Riehen die einzige Landgemeinde des Kantons Basel-Stadt.»"))
edge("org-kanton-bs", "org-bettingen", "jurisdiction_over", ev("https://www.bs.ch/bettingen/gemeinde", "«Bettingen ist neben Riehen die einzige Landgemeinde des Kantons Basel-Stadt.»"))
edge("org-kanton-bs", "org-stadt-basel", "jurisdiction_over", ev("https://www.bs.ch/bettingen/gemeinde", "Neben den zwei Landgemeinden Riehen und Bettingen ist Basel die Stadtgemeinde (nur indirekt aus dieser Quelle).", "low"))
org("org-bg-bettingen", "Bürgergemeinde Bettingen", "politik", "buergergemeinde", "unknown", legal="öffentlich-rechtliche Körperschaft", owned=False,
    note="Körperschaft des kantonalen Rechts; keine Eigentümerschaft des Kantons behauptet.")
edge("org-kanton-bs", "org-bg-bettingen", "jurisdiction_over", ev("https://www.bs.ch/bettingen/politik/buergergemeinde", "«Die Bürgergemeinde Bettingen ist gemäss Gemeindegesetz eine öffentlich-rechtliche Körperschaft des Kantons Basel-Stadt. Sie erteilt das Gemeindebürgerrecht.»"))
org("org-bg-riehen", "Bürgergemeinde Riehen", "politik", "buergergemeinde", "unknown",
    note="Nur Planungshinweis (https://www.buergergemeinde-riehen.ch/buergergemeinde.html); in dieser Runde nicht abgerufen, daher ohne belegte Beziehung.")
org("org-bg-basel", "Bürgergemeinde der Stadt Basel", "politik", "buergergemeinde", "unknown", note="Webauftritt: Websuche nennt bgbasel.ch, kein offizieller Rückverweis geprüft → unbekannt.")
edge("org-stadt-basel", "org-bg-basel", "links_to", ev("https://www.bs.ch/themen/persoenliches-und-wohnen/einbuergerungen", "Kantonale Einbürgerungsseite abgerufen; sie verlinkt keine Bürgergemeinde-Website. Zuordnung bleibt offen.", "low"))

# --- public institutions with sourced ownership (Beteiligungsbericht 2024, Stand 31.12.2024)
INST = [  # id, name, sponsorship, share text, legal form, listed on org page as «Selbständige Betriebe»
    ("bvb", "Basler Verkehrs-Betriebe (BVB)", "owned_public_entity", "Kantonsanteil 100 % (beherrscht)", "sAöR", True),
    ("iwb", "Industrielle Werke Basel (IWB)", "owned_public_entity", "Kantonsanteil 100 % (beherrscht)", "sAöR", True),
    ("usb", "Universitätsspital Basel", "owned_public_entity", "Kantonsanteil 100 % (beherrscht)", "sAöR", True),
    ("upk", "Universitäre Psychiatrische Kliniken Basel", "owned_public_entity", "Kantonsanteil 100 % (beherrscht)", "sAöR", True),
    ("felix-platter", "Universitäre Altersmedizin Felix Platter", "owned_public_entity", "Kantonsanteil 100 % (beherrscht)", "sAöR", True),
    ("uzb", "Universitäres Zentrum für Zahnmedizin Basel (UZB)", "owned_public_entity", "Kantonsanteil 100 % (beherrscht)", "sAöR", True),
    ("bkb", "Basler Kantonalbank", "owned_public_entity", "Kantonsanteil 85,5 % (beherrscht)", "sAöR", False),
    ("unibas", "Universität Basel", "jointly_sponsored", "gemeinschaftlich mit anderen Kantonen, Anteil 50 %", "sAöR", True),
    ("ukbb", "Universitäts-Kinderspital beider Basel (UKBB)", "jointly_sponsored", "gemeinschaftlich, Anteil 50 %", "sAöR", False),
    ("fhnw", "Fachhochschule Nordwestschweiz (FHNW)", "jointly_sponsored", "gemeinschaftlich, Anteil 19 %", "sAöR", True),
    ("srh", "Schweizerische Rheinhäfen (SRH)", "jointly_sponsored", "gemeinschaftlich, Anteil 66 %", "sAöR", True),
    ("mfp", "Motorfahrzeugprüfstation beider Basel", "jointly_sponsored", "gemeinschaftlich, Anteil 60 %", "sAöR", False),
    ("swisstph", "Schweizerisches Tropen- und Public Health-Institut", "jointly_sponsored", "gemeinschaftlich, Anteil 50 %", None, False),
    ("gvbs", "Gebäudeversicherung des Kantons Basel-Stadt", "state_participation", "massgeblicher Einfluss, keine kapitalmässige Beteiligung", "sAöR", False),
    ("mch", "MCH Group AG", "state_participation", "massgeblicher Einfluss, Anteil 37,5 %", "AG", False),
]
for code, name, spons, share, legal, listed in INST:
    area = "bildung" if code in ("unibas", "fhnw", "swisstph") else "institutionen"
    org(f"org-{code}", name, area, "joint_institution" if spons == "jointly_sponsored" else "public_institution", spons, legal=legal, note=share, owned=True)
    rel = {"owned_public_entity": "owns_or_sponsors", "jointly_sponsored": "jointly_sponsors", "state_participation": "participates_in"}[spons]
    edge("org-kanton-bs", f"org-{code}", rel, ev(BB, f"Beteiligungsspiegel 2024: «{name}», {share}; Rechtsform {legal or 'nicht angegeben'}.", "high", BB_DATE))
    if listed:
        edge("org-kanton-bs", f"org-{code}", "links_to", ev(ORG_PAGE, f"Auf der kantonalen Organisationsseite unter «Selbständige Betriebe» verlinkt.", "high"))
for code, name in (("ak-bs", "Ausgleichskasse Basel-Stadt"), ("ivbs", "IV-Stelle Basel-Stadt")):
    org(f"org-{code}", name, "institutionen", "public_institution", "unknown", note="Unter «Selbständige Betriebe» verlinkt, nicht im Beteiligungsspiegel 2024; Trägerschaft nicht belegt.")
    edge("org-kanton-bs", f"org-{code}", "links_to", ev(ORG_PAGE, f"Auf der kantonalen Organisationsseite unter «Selbständige Betriebe» verlinkt.", "high"))

# --- private partners / federal (operators, as stated on the properties' own legal pages)
for code, name, t in (("liip", "Liip AG", "private_partner"), ("oriented", "oriented.net GmbH", "private_partner"), ("seantis", "Seantis (Firma)", "private_partner"),
                      ("onegov", "OneGov.ch (Verein)", "unknown"), ("talus", "Talus Informatik AG", "private_partner"), ("eyeloveyou", "eyeloveyou GmbH", "private_partner"),
                      ("lab5", "Lab5", "private_partner"), ("agov", "Bund – Authentifizierungsdienst AGOV", "federal")):
    org(f"org-{code}", name, "plattformen", t, "private" if t == "private_partner" else "unknown",
        note="OneGov.ch ist laut Impressum ein Verein aus Kantonen, Gemeinden, öffentlichen Institutionen und Fachpartnern." if code == "onegov" else None)

# --- web properties
_q = json.load(open("docs/experiments/basel-report/batch-queue.json"))
HIST_BS = [q["id"] for q in _q if q["url"].startswith("https://www.bs.ch/")]
HIST_EP = [q["id"] for q in _q if q["url"].startswith("https://eportal.egov.bs.ch/")]
B53 = "https://www.bs.ch/"
prop("wp-bs", "https://www.bs.ch", "www.bs.ch – Webauftritt Kanton (inkl. Stadt- und Bettingen-Seiten)", "portal", authorized=True,
     hist=HIST_BS, owned=True, fetched=True)
prop("wp-eportal", "https://eportal.egov.bs.ch", "ePortal", "portal", authorized=True, hist=HIST_EP, login=True, owned=True, fetched=True)
prop("wp-ekonto", "https://ekonto.egov.bs.ch", "eKonto (Anmeldung)", "login", login=True)
prop("wp-eservices", "https://eservices.egov.bs.ch", "eServices (Transaktionen)", "transaction_app", login=True)
prop("wp-esteuern", "https://esteuern.bs.ch", "eSteuern.BS", "transaction_app", login=True)
prop("wp-formulare", "https://formulare.bs.ch", "Formulare BS", "transaction_app")
prop("wp-jaxforms", "https://jaxforms.cloud.bs.ch", "jaxforms (Formulardienst)", "transaction_app")
prop("wp-bussen", "https://bussen.egov.bs.ch", "Bussen bezahlen", "transaction_app")
prop("wp-eumzug", "https://www.eumzug.swiss", "eUmzug Schweiz", "external_service")
prop("wp-media", "https://media.bs.ch", "media.bs.ch (Dokumente)", "document_store", owned=True, fetched=True)
prop("wp-mapgeo", "https://map.geo.bs.ch", "MapBS (Stadtplan)", "map")
prop("wp-staatskalender", "https://staatskalender.bs.ch", "Staatskalender", "website", alternates=["https://www.staatskalender.bs.ch/"], fetched=True)
prop("wp-riehen", "https://www.riehen.ch", "riehen.ch – Gemeinde Riehen", "website", fetched=True)
prop("wp-riehen-jobs", "https://app.jobportal.abaservices.ch", "Stellenportal (Abacus-Dienst, von Riehen verlinkt)", "external_service")
prop("wp-grosserrat", "https://grosserrat.bs.ch", "grosserrat.bs.ch", "website", fetched=True)
prop("wp-pixas", "https://grosserratbs.pixas.ch", "Grosser Rat intern (PIXAS)", "login", login=True)
prop("wp-bvb", "https://www.bvb.ch", "bvb.ch", "website", canonical="https://www.bvb.ch/de/", fetched=True)
prop("wp-iwb", "https://www.iwb.ch", "iwb.ch", "website", fetched=True)
prop("wp-usb", "https://www.unispital-basel.ch", "unispital-basel.ch", "website", fetched=True)
prop("wp-unibas", "https://www.unibas.ch", "unibas.ch", "website", canonical="https://www.unibas.ch/de", fetched=True)
prop("wp-unibas-services", "https://services.unibas.ch", "Universität: Online Services", "login", login=True)
prop("wp-ak", "https://ak-bs.ch", "Ausgleichskasse Basel-Stadt", "website", alternates=["https://www.ausgleichskasse-bs.ch/"])
prop("wp-ivbs", "https://www.ivbs.ch", "ivbs.ch", "website", fetched=True)
prop("wp-fhnw", "https://www.fhnw.ch", "fhnw.ch (Kantonsseite verlinkt http://; https nicht geprüft)", "website")
prop("wp-upk", "https://www.upkbs.ch", "upkbs.ch (Kantonsseite verlinkt http://; https nicht geprüft)", "website")
prop("wp-felixplatter", "https://www.felixplatter.ch", "felixplatter.ch", "website")
prop("wp-uzb", "https://www.uzb.ch", "uzb.ch (Kantonsseite verlinkt http://; https nicht geprüft)", "website")
prop("wp-srh", "https://www.portofbasel.ch", "portofbasel.ch (Kantonsseite verlinkt http://; https nicht geprüft)", "website")
prop("wp-edkb", "https://ed-kinderbetreuung.edubs.ch", "Kinderbetreuung (Fachportal)", "external_service")
prop("wp-draeggwaegg", "https://app.draeggwaegg.ch", "Dräggwägg (Abholung anmelden)", "external_service")

# --- property relations
edge("org-webredaktion", "wp-bs", "responsible_editorially", ev(IMPRESSUM, "Impressum: «Anfragen zur Webseite: Webredaktion».", "high"))
edge("org-itbs", "wp-bs", "operates_technically", ev(IMPRESSUM, "«Design, Implementierung und Betrieb: IT BS (Kanton Basel-Stadt) in Zusammenarbeit mit Liip AG».", "high"))
edge("org-liip", "wp-bs", "operates_technically", ev(IMPRESSUM, "«… in Zusammenarbeit mit Liip AG».", "high"))
edge("org-oriented", "wp-bs", "operates_technically", ev(IMPRESSUM, "Impressum, Abschnitt «Hosting»: «oriented.net GmbH».", "high"))
edge("org-seantis", "wp-staatskalender", "operates_technically", ev(IMPRESSUM, "«Der Staatskalender wird durch die Firma Seantis im Auftrag des Kantons Basel-Stadt betrieben und auf OneGov Cloud gehostet.»", "high"))
edge("org-onegov", "wp-staatskalender", "operates_technically", ev(IMPRESSUM, "Staatskalender «auf OneGov Cloud gehostet».", "high"))
edge("org-kanton-bs", "wp-staatskalender", "publishes_property", ev(IMPRESSUM, "Betrieb «im Auftrag des Kantons Basel-Stadt».", "high"))
for wp in ("wp-eservices", "wp-esteuern", "wp-eportal"):
    edge("org-itbs", wp, "operates_technically", ev("https://www.bs.ch/fd/itbs", "«Die dafür benötigten E-Government-Bausteine, die Plattform und die Infrastruktur werden ebenfalls von der IT BS bereitgestellt.»", "medium" if wp == "wp-esteuern" else "high"))
edge("wp-eportal", "wp-ekonto", "transaction_boundary", ev("https://www.bs.ch/fd/itbs/eportal-nutzungsbedingungen", "«Beim Erst-Login mit dem persönlichen AGOV-Konto wird im ePortal automatisch ein lokales Benutzerkonto (eKonto) erstellt.»"))
edge("org-agov", "wp-eportal", "operates_technically", ev("https://www.bs.ch/fd/itbs/eportal-nutzungsbedingungen", "Login wird zu AGOV, dem «Authentifizierungsdienst des Bundes», weitergeleitet (nur Anmeldung).", "high"))
edge("org-riehen", "wp-riehen", "responsible_editorially", ev("https://www.riehen.ch/impressum/", "«Verantwortlich für den Inhalt dieser Internetpräsenz: Gemeindeverwaltung Riehen, Kommunikation».", "high"))
edge("org-talus", "wp-riehen", "operates_technically", ev("https://www.riehen.ch/impressum/", "Impressum: «Realisierung Talus Informatik AG».", "high"))
edge("wp-riehen", "wp-riehen-jobs", "links_to", ev("https://www.riehen.ch/", "Startseite verlinkt «Offene Stellen» auf app.jobportal.abaservices.ch.", "high"))
edge("org-grosser-rat", "wp-grosserrat", "publishes_property", ev("https://grosserrat.bs.ch/", "Titel der Startseite: «Grosser Rat Basel-Stadt – Willkommen».", "high"))
edge("org-eyeloveyou", "wp-grosserrat", "operates_technically", ev("https://grosserrat.bs.ch/impressum", "Impressum: «Konzept & Design eyeloveyou GmbH».", "medium"))
edge("org-lab5", "wp-grosserrat", "operates_technically", ev("https://grosserrat.bs.ch/impressum", "Impressum: «Development Lab5».", "medium"))
edge("wp-grosserrat", "wp-pixas", "transaction_boundary", ev("https://grosserrat.bs.ch/", "Startseite verlinkt «Intern (PIXAS)» auf grosserratbs.pixas.ch (Anmeldung, nicht aufgerufen).", "high"))
for code, wp in (("bvb", "wp-bvb"), ("iwb", "wp-iwb"), ("usb", "wp-usb"), ("unibas", "wp-unibas"), ("ivbs", "wp-ivbs"), ("fhnw", "wp-fhnw"), ("upk", "wp-upk"),
                 ("felix-platter", "wp-felixplatter"), ("uzb", "wp-uzb"), ("srh", "wp-srh"), ("ak-bs", "wp-ak")):
    edge(f"org-{code}", wp, "publishes_property", ev(ORG_PAGE, "Kantonale Organisationsseite verlinkt diese Website für die Institution (Betreiber nicht belegt).", "medium"))
edge("wp-unibas", "wp-unibas-services", "transaction_boundary", ev("https://www.unibas.ch/de", "Startseite verlinkt «Online Services» auf services.unibas.ch (nicht aufgerufen).", "high"))
edge("org-bettingen", "wp-bs", "publishes_property", ev("https://www.bs.ch/bettingen/gemeinde/dienstleistungen-behoerdengaenge-online-durchfuehren", "«Die Gemeindeverwaltung Bettingen bietet Ihnen viele Ihrer Dienstleistungen auch online an» – auf www.bs.ch/bettingen.", "high"))
edge("org-kanton-bs", "wp-bs", "publishes_property", ev(IMPRESSUM, "Impressum: «Allgemeine Adresse Kanton Basel-Stadt».", "high"))
edge("org-kanton-bs", "wp-media", "publishes_property", ev(BB, "Beteiligungsbericht des Kantons liegt auf media.bs.ch.", "medium", BB_DATE))

# --- services (#53 inventory S01..S25) → properties; owners as stated on the service pages (#53 discovery)
data = json.load(open(P))
HOST2WP = {p["origin"].split("://")[1]: p["id"] for p in props}
OWNER = {"Einwohneramt": "org-einwohneramt", "Passamt": "org-passamt", "Tiefbauamt": "org-tiefbauamt", "Kantonspolizei": "org-kapo",
         "Bau- und Gastgewerbeinspektorat": "org-bgi", "Fachstelle Tagesbetreuung": None}
for e in data["entries"]:
    sid, url = e["serviceId"], e["entryUrl"]
    wp = "wp-eportal" if "eportal" in url else "wp-bs"
    edge(wp, sid, "entry_point_of", ev(url, f"Einstieg des Dienstes «{e['title']}».", "high"))
    for h in sorted(set(e["boundary"]["transactionHosts"] + e["boundary"]["thirdPartyHosts"] + e["boundary"]["embeddedOrMapHosts"])):
        if h in HOST2WP:
            rel = "embeds" if h in ("map.geo.bs.ch", "geo.bs.ch") else "transaction_boundary"
            edge(sid, HOST2WP[h], rel, ev(url, f"Dienstseite verlinkt bzw. bettet {h} ein (#53-Entdeckung).", "high"))
    o = e.get("operator")
    if o and OWNER.get(o):
        edge(OWNER[o], sid, "responsible_editorially", ev(url, f"Seitenangabe «Für dieses Thema zuständig: {o}».", "high"))
    elif o and o.startswith("Arbeitsbeziehungen"):
        edge("org-awa", sid, "responsible_editorially", ev(url, f"Seitenangabe «Für dieses Thema zuständig: {o}».", "high"))

# --- next batch proposal (not executed; 15 pages)
BATCH = [
    ("core", "https://www.bs.ch/bettingen/gemeinde/dienstleistungen-behoerdengaenge-online-durchfuehren", "wp-bs", None, "Gemeindedienste von Bettingen auf dem Kantonsauftritt – andere Trägerschaft, gleiche Vorlage."),
    ("core", "https://www.bs.ch/themen/persoenliches-und-wohnen/einbuergerungen", "wp-bs", None, "Einbürgerung: wichtige Bürgeraufgabe mit Bürgergemeinde-Bezug."),
    ("core", "https://www.bs.ch/willkommen-bei-den-gerichten", "wp-bs", None, "Judikative auf dem Kantonsauftritt; Zugang zu Gerichten."),
    ("core", "https://www.bs.ch/themen/persoenliches-und-wohnen/umzug-und-wegzug/wegzug-vom-kanton-melden", "wp-bs", "S05", "Bisher nicht geprüft; Bezahlschritt-Grenze (eServices)."),
    ("core", "https://www.bs.ch/themen/finanzielle-hilfe/menschen-mit-behinderung", "wp-bs", "S13", "Zielgruppe direkt betroffen; bisher nicht geprüft."),
    ("core", "https://www.bs.ch/gebaerdensprache", "wp-bs", "S23", "Barrierefreie Kommunikation; Videos (Basel nennt Videos selbst als Einschränkung)."),
    ("core", "https://www.bs.ch/apps/zonensuche", "wp-bs", "S09", "Nachtest der reproduzierten #53-Beobachtung (Pflichtfeld-Hinweis)."),
    ("other_public", "https://www.riehen.ch/", "wp-riehen", None, "Eigene Gemeinde, eigener Betreiber (Talus), eigene Barrierefreiheitserklärung (2022)."),
    ("other_public", "https://grosserrat.bs.ch/", "wp-grosserrat", None, "Legislative, eigene Website mit externen Dienstleistern."),
    ("other_public", "https://www.bvb.ch/de/", "wp-bvb", None, "ÖV-Unternehmen des Kantons (100 %, sAöR); in der Entdeckung 502 – Erreichbarkeit vor Prüfung klären."),
    ("other_public", "https://www.unispital-basel.ch/", "wp-usb", None, "Spital des Kantons (100 %, sAöR); Gesundheitsaufgabe."),
    ("other_public", "https://www.iwb.ch/", "wp-iwb", None, "Versorgung (100 %, sAöR); Kundendienste."),
    ("other_public", "https://www.unibas.ch/de", "wp-unibas", None, "Gemeinsam getragen (50 %); zeigt Grenze zwischen kantonaler und gemeinsamer Trägerschaft."),
    ("external_dependency", "https://eservices.egov.bs.ch/", "wp-eservices", "S04", "Transaktionsplattform der IT BS: nur öffentliche Einstiegsseite bis zur ersten Eingabe, keine Eingabe."),
    ("external_dependency", "https://www.eumzug.swiss/", "wp-eumzug", "S04", "Externer Umzugsdienst, den der Kanton für «Umzug melden» verlinkt."),
]
data["organisations"], data["webProperties"], data["edges"] = orgs, props, edges
data["batchProposal"] = [{"rank": i + 1, "url": u, "propertyId": wp, "serviceId": sid, "ring": ring, "reason": why,
                          "authorisationNeeded": "existing (www.bs.ch/eportal)" if wp in ("wp-bs", "wp-eportal") else "new explicit scope"}
                         for i, (ring, u, wp, sid, why) in enumerate(BATCH)]
for p in data["webProperties"]:
    if any(b["propertyId"] == p["id"] for b in data["batchProposal"]): p["status"]["selected"] = True
data["lastDiscovery"] = "2026-10-29"
json.dump(data, open(P, "w"), indent=1, ensure_ascii=False)
print(len(orgs), "organisations,", len(props), "properties,", len(edges), "edges,", len(data["batchProposal"]), "proposed pages")
