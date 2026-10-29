# Basel discovery plane — broaden the map, keep assessment scoped

Date: 2026-10-29. Owner explicitly requested wider Basel discovery and a visual scope.
This branch builds on #53, not main. Preserve original field evidence and its limited coverage.

## Current visual

Open index.html locally. It embeds the 25-entry inventory and 11 linked-host seeds, includes searchable
services, known transaction relationships and sourced discovery areas. It works without an API.
The 12-page field batch remains historical; no new domain assessment is claimed.
discovery-data.json duplicates the embedded seed for inspection; updates must regenerate both consistently.

## Next Claude Code / Orca packet — 90 minutes

Owner-authorized work: extend read-only public DISCOVERY and its visual map across Basel-Stadt.
This is not blanket authorization to run accessibility probes on every newly found host.
Read current repo and Weavr state; no scope waiver or invented Mission.
Use one research worker and one data/UI worker where disjoint; coordinator validates sources and integration.

### 1. Inventory organisations and web properties separately

Start from official cantonal organisation/service directories and government legal/financial primary sources.
Expand to Riehen, Bettingen and Bürgergemeinden; parliament/judiciary; public schools, culture, transport,
utilities, public health institutions and jointly sponsored bodies. Verify current roles individually.
Do not infer state ownership from public access, a .bs.ch domain, a logo, funding, government link or service use.

Relations must be separate:
- jurisdiction and public task;
- legal owner/sponsor, legal form, ownership share if actually sourced;
- editorial/service-responsible office;
- technical operator/vendor (often unknown);
- website host/origin and canonical public entry point;
- task's onward transaction/embedded/login boundaries.

A site can be publicly accessible and privately operated; a public body can use an external service.
Joint sponsorship and state participation are separate categories, not full canton ownership.
Do not put Basel-Landschaft or unrelated Basel-region institutions into Basel-Stadt by geographic association.
Capture evidence URL, quoted short support/paraphrase, retrieval date, source date and confidence per relationship.

### 2. Bounded discovery

Use web search and official organisational lists first. At most 60 new HTML document loads total across
at most 20 manually reviewed official origins. Before following a new origin, establish its identity from
an official backlink or primary source and record why it is relevant. No wildcard crawling or subdomain enumeration.
At most one browser worker; respect robots/site guidance including the previously observed 10-second delay
for bs.ch; use at least 3 seconds between top-level loads elsewhere or stricter published policy.
At most depth 1 beyond reviewed organisation/portal entries. Stop on restriction/login; record boundaries.
No typing, form submission, transactions, active security tools, private areas or downloads in bulk.
Source discovery is allowed on additional official public websites; accessibility scanning remains limited
to the previously authorized www.bs.ch / eportal.egov.bs.ch batch and is not needed in this packet.
Third-party linked services may be inventoried from public official links, not probed.

Aim for a defensible expansion, e.g. 30–50 organisations/properties if official sources support it,
rather than claiming completeness. Do not fabricate entries to meet a target.

### 3. Data model and visual

Introduce small typed JSON records for organisations, web properties, service tasks and evidenced edges.
Track public visibility, sponsorship/ownership, operator and assessment authorization independently.
Use stable IDs. Host != organisation != application != service; multiple apps can share a host.
Preserve unknowns and alternate/canonical URLs; avoid treating redirects as separate organisations.
Keep existing 25 service IDs and historical assessment IDs; no invented coverage or denominator of all Basel sites.

Extend index.html with:
- overview by area / organisation type;
- organisation → public web property → service/transaction links;
- filters for confirmed public body, jointly owned, private partner, unknown;
- separate status: discovered, ownership evidenced, selected, assessed, out of scope, login boundary;
- visible source and confidence on each claim;
- last discovery date and non-exhaustiveness statement;
- batch-selection preview with explicit reasons, not automatic scanner execution.

Keep the already built searchable explorer if it works; no graph framework or backend is necessary.
A compact expandable hierarchy plus relation tables is preferable to an unreadable force-directed graph.
Link to #53's field report and preserve its two observations / one false alarm without strengthening claims.

### 4. Strategy output

A one-page scope proposal:
core canton/city services, other public bodies, and external public-service dependencies as separate rings.
Propose the next 10–15-page assessment batch by user importance, interface diversity, ownership evidence and
boundary coverage. External/login hosts remain proposed until a separate explicit assessment scope is set.
Explain what percent-of-sample measures mean; never manufacture a total Basel web universe denominator.

### 5. Quality

Validate IDs, URLs, edge targets, duplicate origins, source presence and snapshot/embedded-data consistency.
Verify search, filters, selection, keyboard use, empty states and mobile layout in a browser.
No network requests should be needed to view the saved map.
Spot-check ownership claims from primary sources; downgrade ambiguity rather than infer.
Preserve official source publication dates: older budgets are leads, not present-day ownership proof.
Return an illustrated short report plus updated draft PR and one next action. No merge/deploy/outreach.
Mistral optional for public-source triage only within the original USD 5 total ledger; deterministic source
checks and Claude subscription coordination suffice. No API budget reset.

## Primary-source leads checked in the planning chat

- https://www.bs.ch/regierungsrat/aufgaben-und-kompetenzen-des-regierungsrates
- https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/153.100
- https://www.bs.ch/it/node/28398 (official Bettingen entry; verify canonical current entry)
- https://www.buergergemeinde-riehen.ch/buergergemeinde.html
- https://www.bs.ch/medienmitteilungen/2026-pensionskassengesetz-punktuelle-anpassungen-bewaehrtem-gesetz

These support organisational discovery leads; they do not prove ownership of every linked web property.
