# Fortschritt (Stand 29.10.2026)

- **Stände:** main `c8a70f8` (Commit 26.10.2026, geprüft 29.10.2026); Draft-PR #52 `87d6e17` (A/B/C/M-Experiment); Draft-PR #53 (dieser Basel-Feldbericht, auf #52 gestapelt).
- **Implementiert und getestet (main):** deterministischer Scanner (axe, sichere Tastatur-Journeys, Coverage, Screenshots) und opt-in Publikations-Export mit SSH-signierter Freigabe, nur mit simulierter Autorität getestet. Menschlich geprüft: nichts.
- **Nicht angebunden:** bestehende Berichts-, Audit-, Vergleichs- und Serving-Pfade nutzen die Publikationsrichtlinie nicht. Modelle sind nur experimentell, nicht im Produktionspfad.
- **s1/s2:** A 4/4 je Runde, B und C 0/4 (lokales qwen3:1.7b, nur CPU; keine Aussage über andere Modelle oder GPU).
- **s3:** A 12/12 Instanzen (4 Barrieren × 3), M 6/12; Urteile M 7 belegt / 20 widerlegt / 4 unzureichend (ohne Duplikate 7 widerlegt, 4 verschiedene falsche Aussagen), A 12/0/0; M 14 Duplikate.
- **M** besuchte alle Seiten, belegte aber mit falscher Evidenz und löste Escape im Dialog nie aus; 129 s, davon ~111 s eigene Ratenbegrenzung.
- **Kosten:** Mistral gesamt 0,073 USD (laut Ledger).
- **Grenze:** nur offengelegte Entwicklungs-Fixtures, kein Feld-Recall/-Präzision, keine AT-Nutzer-Validierung, modellgestützte statt menschlicher Beurteilung.
- **Schwellen:** KI als Detektor braucht verifizierte Evidenz und wenig Falschbehauptungen; KI als Triage-Hilfe braucht getreue, belegte Formulierung; ein deterministischer Partner-Pilot muss nicht auf KI warten.
