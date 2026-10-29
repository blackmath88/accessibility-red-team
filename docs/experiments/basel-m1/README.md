# Basel M1: adaptive Untersuchung des Pflichtfeld-Hinweises

Privater Arbeitsbericht zu Draft-PR #55, Meilenstein M1. Keine Veröffentlichung, keine Konformitätsaussage, keine Kontaktaufnahme.
Öffnen: `xdg-open docs/experiments/basel-m1/index.html`

- **Frage:** Warum ist der Hinweis «* muss ausgefüllt werden» auf www.bs.ch/apps/zonensuche gerendert ≈1,12:1, berechnet aber 4,48:1?
- **Ergebnis:** Bei 1440 und 1280 px liegt die Überschrift (`h3`, sticky, z-8, Weiss 90 %) im statischen Layout über dem Hinweis: gemessen 242, berechnet 241,4. Das wurde reproduziert und durch lokale Kontrollen gestützt. Verworfen: Kantenglättung, Eltern-Deckkraft, Scroll-Zustand. Bei 390 px gibt es keine Überlagerung (Hinweis frei 119); beim Laden verdeckt dort aber der Cookie-Banner den Hinweis.
- **KI-Beitrag:** Mistral entwarf 6 Hypothesen- und Probe-Sätze (a1–a6). a2 lieferte die entscheidende Desktop-Evidenz. a3 bis a5 stagnierten, a5 behauptete Änderungen, die nicht im Code stehen. a6 scheiterte an der neuen lokalen Kopie `fixed-banner` und lief deshalb nicht live. Die einzige gültige Mobil-Messung stammt aus der handgeschriebenen Gegenprobe c1. Kritiker und Richter waren frische Claude-Kontexte.
- **Grenzen:** Live wurden 8 von 16 Ladevorgängen genutzt, auf einer einzigen URL, ohne Klicks oder Eingaben. Generierter Code lief in einer bwrap-Sandbox und erreichte die Seite nur über den Lese-Broker. Mistral kostete in M1 USD 0.0188, insgesamt USD 0.0914 von höchstens USD 5.
- **Unabhängiger Code-Review** (15 Befunde, frischer Claude-Kontext):
  - *Behoben* in a45a2d0, mit sieben Grenztests:
    - #1–3: Broker-Aufrufe laufen nacheinander und werden beim Empfang gezählt; beim Abschluss wird abgebrochen und auf laufende Arbeit gewartet.
    - #4: Bei einer Landung ausserhalb der freigegebenen Origin wird die Seite geschlossen.
    - #5: Eine Nicht-Objekt-Zeile wird zur Verletzung, statt den Koordinator abstürzen zu lassen.
    - #6: Node-Permission-Modell, keine Kindprozesse und keine Worker.
    - #8: Kostenreservierung vor jedem bezahlten Aufruf.
    - #9: Ledger schlagen geschlossen fehl, Pfade sind am Repo-Wurzelverzeichnis verankert.
    - #10: Live nur für Live-Pakete, einmal pro Versuch.
    - #14: Frühere Ergebnisse bleiben erhalten.
  - *Teilweise:*
    - #7: /tmp ist begrenzt, Speicher ausserhalb des V8-Heaps nicht (kein RLIMIT_AS, das Node zum Absturz brachte).
    - #15: Die Tests laufen unter `npm test`; der Token-Test belegt wenig, weil die Probe den Token aus `process.argv` lesen kann.
  - *Offen:*
    - #11: Seitenskripte könnten globale Funktionen überschreiben, die die festen Snippets nutzen; die Messwerte sind deshalb nur so vertrauenswürdig wie die Seite.
    - #12: Seiteninitiierte Neuladungen werden nicht gezählt.
    - #13: Die erste Anfrage eines Popups und Drittanbieter-GETs sind nicht begrenzt.
  - Die Live-Läufe a2 und c1 fanden vor der Härtung statt, nacheinander und mit je einem Öffnen.
- **Nächster Schritt:** Firefox/WebKit und DPR 2 mit dem Restbudget prüfen; einen Befund für die Redaktion erst danach und nur nach Freigabe vorbereiten.
- **Evidenz:** `evidence/` (Vorschläge, Probes, Gegenprobe, Kritiken, Urteil, Messübersicht, Live-Ledger), `img/` (Ausschnitte 2×).
- **Rohdaten-Archiv** ausserhalb von Git: `basel-m1-archive.tar.gz`, SHA-256 `f24d404b0bc2cd8d79de48f9de8db7e4b32deb13e59ccee0c160867ffae02ba1`.

Bezug: `docs/experiments/BASEL_ADAPTIVE_INVESTIGATION_MILESTONE.md`, `docs/adr/0015-bounded-adaptive-investigations.md`.
