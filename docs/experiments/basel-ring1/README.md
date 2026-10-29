# Basel-Stadt Ring 1 (29.10.2026): Kurzfassung

Privater Arbeitsbericht, keine Veröffentlichung. Bericht: `index.html` (eigenständig, Bilder in `img/`).
Öffnen: `xdg-open docs/experiments/basel-ring1/index.html`

- **Freigabe:** vom Eigentümer für die 7 Kernseiten (Ring 1) auf www.bs.ch, gleiche Grenzen wie #53; mit diesem Lauf aufgebraucht.
- **Lauf:** 7 Seiten (`batch-queue.json`) mit Produktions-Scanner und sicheren Tastatur-Journeys, 14/14 Läufe ohne Abbruch in
  132 s, Code `620e232`, 10 s Abstand, keine Wiederholung. Zählwerte: `results.json`. Insgesamt 14 Seitenaufrufe.
- **Ergebnis:** keine neuen Kandidaten – jedes axe-Signal (Regel und Element) kam schon im #53-Lauf vor (eines mit anderem
  Selektor, identischem Element-HTML). Meist gemeinsame Komponenten (Suchfeld 6/7, Hauptbereich 7/7, Regionen); drei Signale nur
  auf der Abfallzonen-Suche, wie in #53.
- **Nachtest Abfallzonen-Suche (Zonensuche-App):** Pflichtfeld-Hinweis weiterhin dunkelster Grauwert 242 (≈1,12:1), wie in #53; axe berechnet 4,47:1. Alle axe-Signale kamen schon in #53 vor (aus den Rohdaten geprüft).
  Ursache (halbtransparente klebende Überschrift) weiterhin Hypothese.
- **Nicht als Befund gewertet:** Fokus-Journey (bekannter Fehlalarm aus #53), Dialog-Journey «zu prüfen», Videoinhalte.
- **Modelle:** keine. Mistral gesamt unverändert USD 0,073 von 5.

Rohdaten ausserhalb von git (`basel-ring1-archive.tar.gz`, SHA-256 in `ARCHIVE.sha256`).
