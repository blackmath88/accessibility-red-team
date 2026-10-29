# Discovery data model v2 (`art/basel-discovery/v2`)

`discovery-data.json` (and the identical copy embedded in `index.html`) holds:

```jsonc
{
  "schema": "art/basel-discovery/v2",
  "generatedAt": "2026-10-29",
  "lastDiscovery": "2026-10-29",
  "note": "Not exhaustive; no denominator of all Basel web properties.",
  "entries": [ /* the 25 historical service entries S01..S25, unchanged (v1 shape) */ ],
  "hosts":   [ /* the 11 historical linked-host seeds, unchanged */ ],
  "areas":   [ /* area cards, may gain fields */ ],
  "organisations": [{
    "id": "org-...", "name": "...", "area": "<area id>",
    "type": "canton_unit|municipality|buergergemeinde|parliament|judiciary|public_institution|joint_institution|private_partner|federal|unknown",
    "legalForm": "... | null",                      // only if sourced
    "sponsorship": "canton_unit|owned_public_entity|jointly_sponsored|state_participation|private|unknown",
    "sponsorshipNote": "... | null",                 // e.g. sourced share text; never inferred
    "parentId": "org-... | null",
    "status": { "discovered": true, "ownershipEvidenced": false }
  }],
  "webProperties": [{
    "id": "wp-...", "origin": "https://...", "canonicalUrl": "https://...", "alternates": ["..."],
    "name": "...", "kind": "portal|website|transaction_app|login|map|external_service|document_store",
    "status": { "discovered": true, "ownershipEvidenced": false, "selected": false, "assessed": false,
                "outOfScope": false, "loginBoundary": false, "visitedInDiscovery": false },
    "assessmentAuthorized": false,                  // true only for www.bs.ch / eportal: authorised for the bounded #53 batch, which is used up
    "historicalAssessmentIds": []                    // e.g. ["p01-start"]; only from the #53 batch
  }],
  "edges": [{
    "id": "e-...", "from": "<org/wp/service id>", "to": "<org/wp/service id>",
    "relation": "parent_of|jurisdiction_over|owns_or_sponsors|jointly_sponsors|participates_in|responsible_editorially|operates_technically|publishes_property|entry_point_of|transaction_boundary|embeds|links_to|built_by",   // built_by = design/development, not operation
    "evidence": [{ "url": "https://...", "support": "short quote or paraphrase (<=25 words)",
                   "retrievedAt": "2026-10-29T..Z", "sourceDate": "YYYY-MM-DD | null", "confidence": "high|medium|low" }]
  }],
  "batchProposal": [{ "rank": 1, "url": "...", "propertyId": "wp-...", "serviceId": "S.. | null",
                      "ring": "core|other_public|external_dependency", "reason": "...",
                      "authorisationNeeded": "new approval (same origin as #53) | new explicit scope (new origin)",
                      "executedIn": "ring1-20261029 (optional)", "assessmentId": "r01 (optional)" }],
  "assessmentRounds": [{ "id": "ring1-20261029", "pages": 7, "report": "../basel-ring1/index.html", "status": "done; approval used" }]
}
```

Rules: host != organisation != application != service; several applications can share a host; redirects are alternates,
not new organisations; an edge without evidence is not allowed; `unknown` is a valid value and must be shown.

Build and validation: edit only `discovery-data.json`, then run `python3 -I scripts/basel_discovery_build.py`
(validates and re-embeds into `index.html`; `--check` verifies without writing). Fixture runs need
`--data <file> --out <page>`; fake test records live only in `test/fixtures/basel-discovery-sample.json`.
