# Basel M1: adaptive Untersuchung des Pflichtfeld-Hinweises

Privater Arbeitsbericht zu Draft-PR #55, Meilenstein M1. Keine Veröffentlichung, keine Konformitätsaussage, keine Kontaktaufnahme.
Öffnen: `xdg-open docs/experiments/basel-m1/index.html`

- **Frage:** Warum ist der Hinweis «* muss ausgefüllt werden» auf www.bs.ch/apps/zonensuche gerendert ≈1,12:1, berechnet aber 4,48:1?
- **Ergebnis:** Bei 1440 und 1280 px liegt die Überschrift (`h3`, sticky, z-8, Weiss 90 %) im statischen Layout über dem Hinweis: gemessen 242, berechnet 241,4. Das wurde reproduziert und durch lokale Kontrollen gestützt. Verworfen: Kantenglättung, Eltern-Deckkraft, Scroll-Zustand. Bei 390 px gibt es keine Überlagerung (Hinweis frei 119); beim Laden verdeckt dort aber der Cookie-Banner den Hinweis.
- **KI-Beitrag:** Mistral entwarf 5 Hypothesen- und Probe-Sätze (a1–a5). a2 lieferte die entscheidende Desktop-Evidenz. a3 bis a5 stagnierten, a5 behauptete Änderungen, die nicht im Code stehen. Die einzige gültige Mobil-Messung stammt aus der handgeschriebenen Gegenprobe c1. Kritiker und Richter waren frische Claude-Kontexte.
- **Grenzen:** Live wurden 8 von 16 Ladevorgängen genutzt, auf einer einzigen URL, ohne Klicks oder Eingaben. Generierter Code lief in einer bwrap-Sandbox und erreichte die Seite nur über den Lese-Broker. Mistral kostete in M1 USD 0.0143, insgesamt USD 0.0869 von höchstens USD 5.
- **Unabhängiger Code-Review:** Es gab 15 Befunde, darunter Nebenläufigkeit von Broker-Aufrufen, Arbeit nach dem Abschluss und Ledger, die bei Fehlern offen blieben. Sie wurden in a45a2d0 behoben, mit sieben Grenztests (`test/investigation-boundary.test.ts`). Alle Live-Läufe von M1 fanden vor dieser Härtung statt, nacheinander und mit je einem Öffnen.
- **Nächster Schritt:** Firefox/WebKit und DPR 2 mit dem Restbudget prüfen; einen Befund für die Redaktion erst danach und nur nach Freigabe vorbereiten.
- **Evidenz:** `evidence/` (Vorschläge, Probes, Gegenprobe, Kritiken, Urteil, Messübersicht, Live-Ledger), `img/` (Ausschnitte 2×).
- **Rohdaten-Archiv** ausserhalb von Git: `basel-m1-archive.tar.gz`, SHA-256 `1a87bf81495474a61d22aba58957e78167243934eb39eb9dc5c09852ad825651`.

Bezug: `docs/experiments/BASEL_ADAPTIVE_INVESTIGATION_MILESTONE.md`, `docs/adr/0015-bounded-adaptive-investigations.md`.
