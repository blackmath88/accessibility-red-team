# Basel-Stadt Feldbericht (29.10.2026): Kurzfassung

Privater Arbeitsbericht, keine Veröffentlichung. Bericht: `index.html` (eigenständig, Bilder in `img/`).
Öffnen: `xdg-open docs/experiments/basel-report/index.html`

- **Entdeckung:** 32 von 40 erlaubten Dokumenten auf www.bs.ch und eportal.egov.bs.ch (Tiefe ≤2, robots.txt: 10 s Abstand),
  25 Dienste inventarisiert (`service-inventory.json`, beobachtet vs. eingeordnet markiert), 11 Transaktions-Hosts als
  künftige Warteschlange (nicht geprüft).
- **Feldlauf:** 12 Seiten (`batch-queue.json`) mit Produktions-Scanner und sicheren Tastatur-Journeys, 24/24 Läufe
  abgeschlossen in 234 s, Code `4fdb589`. Zählwerte je Seite: `field-results.json`.
- **Reproduziert (frischer Browser):** (1) Pflichtfeld-Hinweis der Abfallzonen-Suche praktisch unsichtbar (gerendert
  ≈1,1:1; berechnet 4,48:1); (2) seitenweites Suchfeld mit Kombinationsfeld-Attributen ohne passende Rolle und mit
  fehlendem Bezugselement (9/12 Seiten).
- **Negativbefund:** «Fokus nicht sichtbar» war ein Fehlalarm unseres Werkzeugs (Hintergrundmarkierung nicht erkannt,
  Element ausserhalb des Bildausschnitts gemessen).
- **Nicht geprüft:** Transaktionen (eServices, Formulare, eUmzug, eSteuern), PDFs, Karten, Anmeldung; keine
  Hilfsmittel-Erfahrung.
- **Modelle:** im Feld nicht verwendet. Mistral gesamt unverändert USD 0,073 von 5.
- **Nächster Schritt:** Beobachtungen nach Freigabe als private Arbeitsnotiz an die Webredaktion; Pilot-Entwurf
  «Umzug melden» mit Fachperson und Hilfsmittel-Nutzenden, wiederholbarer Nachtest.

Rohdaten ausserhalb von git (`basel-field-archive.tar.gz`, SHA-256 in `ARCHIVE.sha256`).
