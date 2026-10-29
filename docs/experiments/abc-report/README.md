# A/B/C-Vergleich (29.10.2026): Kurzfassung

Synthetische Entwicklungs-Fixtures `dev-k1..k3` (offengelegt, nicht zurückgehalten). Bericht: `index.html` in diesem
Ordner (eigenständig, Bilder in `img/`). Methode und Begründungen: `../ABC_LOCAL_HYBRID.md`.

| Bedingung | Modell(e) | Sitzungen | Verifizierte Barrieren s1 / s2 | Blind beurteilte Behauptungen (belegt / widerlegt) | Mistral |
|---|---|---|---|---|---|
| A algorithmisch | keins (Frontier-Scheduler + Regeltabelle) | 6 / 6 | 4/4 · 4/4 | 8 / 0 | – |
| B lokales LLM | qwen3:1.7b (Ollama, CPU) | 6 / 6 (4 Zeitlimit, 2 ungültige Ausgabe) | 0/4 · 0/4 | 0 / 0 | – |
| C lokal + Mistral | qwen3:1.7b + mistral-small-2603 (≤2 Beratungen) | 6 / 6 (3 Zeitlimit, 2 ungültig, 1 «unklar») | 0/4 · 0/4 | 0 / 1 | 0,0034 USD (8 Aufrufe, inkl. Smoke) |

Segment s3 (Mistral direkt als Policy, 3 Wiederholungen): **A 12/12 in 7 s, 0 USD · M 6/12 in 129 s (davon ~111 s eigene Ratenbegrenzung), 0,069 USD**. M erkundete vollständig, meldete aber in allen 3 dev-k3-Läufen den korrekt funktionierenden Dialog als fehlerhaft (im frischen Browser widerlegt), belegte den richtigen dev-k1-Defekt mit der falschen Seite, schlug 3-mal vorzeitig «vollständig» vor und erzeugte 14 Duplikate. Blinde Beurteilung: 20 von 31 M-Behauptungen widerlegt (7 ohne Duplikate, 4 verschiedene falsche Aussagen; A: 0 von 12). Mistral gesamt: 0,073 von 5 USD.

- B und C sahen auf dev-k1 und dev-k2 die unbesuchten Unterseiten (Frontier und erlaubte Navigation), verliessen aber nie die Startseite; auf dev-k3 (eine Seite) öffneten sie den zweiten Dialog nie.
- Reparatur «Wiederholungs-Sperre» (s2): griff (21 abgelehnte Wiederholungen), änderte das Ergebnis nicht. Negatives Ergebnis.
- Fall «Fokus nach Escape» (dev-k3): im frischen Browser reproduziert, an einer Kopie repariert, Nachtest erfolgreich.
- Erfundene Behauptung: das lokale Modell kopierte das Beispiel der Anleitung («search-btn»); die blinde Beurteilung stufte
  sie als widerlegt ein.
- Nächster Schritt: A als einziger bewerteter Detektor in einem begrenzten Partner-Pilot; Modelle erst wieder in der Wertung bei mindestens A's Trefferquote und 0 widerlegten Behauptungen.

Rohdaten ausserhalb von git: `abc-runs-archive.tar.gz` (SHA-256 in `ARCHIVE.sha256`, Dateiliste in `ARCHIVE-MANIFEST.sha256`).
Beurteilungen sind modellgestützte Forschungsbewertung, keine menschliche Freigabe; nichts wurde veröffentlicht oder befördert.
Neu erzeugen: `python3 -I scripts/abc_report.py docs/experiments/abc-report/report-config.json` (braucht die archivierten Läufe).
