# Supplied Basel research — service-landscape

Received: 2026-10-29. Source: owner-supplied Perplexity research report.
Status: research input, NOT a validated repository fact, accepted legal interpretation, ownership authority or testing permission.
The original text follows unchanged. Source links and claimed retrieval dates belong to the report's author;
verify material claims against dated primary evidence before adding them to the requirements/stakeholder ledger.
A current public page does not prove current contract, maintenance, approval or complete-process accessibility.
Do not contact named people from this document without owner instruction.

---

## A. Landscape overview

Basel-Stadt’s digital public-service landscape should be mapped as a network of **responsibilities**, not a list of government domains. Your next useful increment is to identify task handoffs between responsible offices, independently governed institutions, shared platforms, documents and authentication services.

Three findings particularly affect pilot selection:

1. Basel-Stadt already has an accessibility improvement programme. The 2025–2028 Aktionsplan Barrierefreie Kommunikation covers cantonal administration and Riehen and Bettingen; courts, the Bürgergemeinde’s central services, parliamentary services and several independent offices have also joined. A pilot should produce evidence useful to this programme rather than establish a parallel generic audit initiative. [bs](https://www.bs.ch/pd/gleichstellung-und-diversitaet/rechte-von-menschen-mit-behinderungen/barrierefreie-kommunikation)
2. The canton explicitly acknowledges problems with PDFs and embedded external content. Its accessibility statement describes only partial conformity and distinguishes supplier-assisted code fixes from structural/content fixes undertaken by departments and offices. This provides a practical starting point for routing findings. [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit)
3. Public sources already expose consequential journey inconsistencies. The Bau- und Gastgewerbeinspektorat advertises digital submission of building applications, while an accessible public OBG application endpoint says applications must be printed and submitted physically. This is a verified conflict between public pages—not proof that the older endpoint remains the intended production route. [bs](https://www.bs.ch/bvd/bgi)

### Scope and evidence convention

Research/retrieval date for all sources below: 29 October 2026. This was passive public-source research: no accounts, submissions, security probing or personal-data collection. Public application text was retrieved, but no interactive accessibility audit was performed.

- Current evidence: an official page available on the retrieval date. This establishes what the source currently publishes, not necessarily that every statement is operationally current.
- Historical lead: a dated report or older document requiring confirmation.
- Inference/proposal: my recommended investigation or interpretation, not an institutional commitment.
- “Unknown” means not established in the sources reviewed; it does not mean absent.
- Publication dates are given where established. Search-index dates are not treated as reliable publication dates.

### What belongs—and how to distinguish it

| Layer | Inclusion rule and important distinctions |
|---|---|
| Canton and city of Basel | Include cantonal departments, offices and their municipal service functions. The official site serves canton/city functions; the Grosser Rat is also Basel’s city parliament. Do not create a duplicate “City of Basel administration” merely because a task is municipal.  [bs](https://www.bs.ch/) |
| Riehen and Bettingen | Separate municipal responsibility records. Bettingen’s official web presence sits within `bs.ch`; Riehen has a separate site. Hosting consolidation does not merge their legal responsibilities.  [bs](https://www.bs.ch/bettingen) |
| Bürgergemeinden | Keep these distinct from Einwohnergemeinden. Basel’s Bürgergemeinde delivers social, naturalisation and integration services through its own institutional structure; Bürgergemeinde Riehen has its own content-responsibility statement.  [bgbasel](https://bgbasel.ch/de/home.html) |
| Parliament, judiciary and independent bodies | Include them separately from executive administration. Courts, appeals commissions and conciliation bodies have different legal roles; a shared website does not erase that distinction.  [bs](https://www.bs.ch/gerichte-judikative/ueber-die-gerichte) |
| Schools, higher education, museums and libraries | Include school-specific pages, parent-facing portals and shared library services. The five cantonal museums are departmental offices; Universität Basel and FHNW have inter-cantonal sponsorship, not simply “Basel ownership”.  [bs](https://www.bs.ch/pd/kultur/museen-und-andere-dienststellen/kantonale-museen) |
| Transport, utilities and hospitals | Include independent public institutions and their apps/customer portals. IWB is explicitly canton-owned; BVB has a current cantonal owner strategy; USB identifies itself as a public-law institution.  [bs](https://www.bs.ch/wsu/kantonale-beteiligungen-wsu) |
| Joint sponsorship and participations | Record sponsor, legal form, policy department and evidence date independently. Universität Basel, FHNW and UKBB are examples where “public” does not mean solely Basel-Stadt-controlled.  [bs](https://www.bs.ch/fd/finanzverwaltung/eignerstrategien/universitaet-basel) |
| Private/shared delivery platforms | Include when they deliver a public task: identity, registration, library discovery, payments or outsourced forms. Record the service relationship, not presumed government ownership. Swisscovery, SLSP and Switch edu-ID demonstrate this clearly.  [ub.unibas](https://ub.unibas.ch/en/search-find/library-catalogues/swisscovery-registration-and-help/) |

Keep Basel-Landschaft and the wider Basel region as separate jurisdiction tags. Regional service coverage, physical location, public funding and legal ownership are four different relationships.

## B. Discovery table: 28 useful web properties and service surfaces

This intentionally mixes standalone properties and consequential service surfaces. It is not a count of independent websites.

Accessibility shorthand: “BS statement” means the statement for `www.bs.ch`, not certification of the linked application or subdomain. Confidence concerns the institutional/task mapping, not accessibility conformity. Unless specifically stated, technical hosting, maintenance and subcontractors remain unknown.

| Organisation | Public task | Exact URL | Ownership/sponsorship evidence | Operator evidence / responsible office | Public/login boundary | Accessibility information | Why investigate | Confidence |
|---|---|---|---|---|---|---|---|---|
| Canton Basel-Stadt | Public information and service discovery | [https://www.bs.ch/](https://www.bs.ch/) | Official canton/city web presence.  [bs](https://www.bs.ch/) | Webredaktion named; code supplier acknowledged but unnamed.  [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit) | Public; outbound services vary | Partial conformity; PDFs, videos and iframes disclosed.  [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit) | Shared navigation and content baseline | High |
| Canton Basel-Stadt | Organisational directory | [https://staatskalender.bs.ch/](https://staatskalender.bs.ch/) | Official Staatskalender.  [staatskalender.bs](https://staatskalender.bs.ch/) | Cantonal contact/Webredaktion; technical operator unknown | Public | Unknown | Resolve organisational hierarchy and accountable offices | High |
| Canton Basel-Stadt | Digital service catalogue | [https://eportal.egov.bs.ch/](https://eportal.egov.bs.ch/) | Describes itself as canton’s digital-service entry point.  [eportal.egov.bs](https://eportal.egov.bs.ch/) | Canton service identity established; technical operator unknown | Catalogue public; some services require AGOV | Separate application assurance unknown | Cross-service discovery and identity handoff | High |
| Einwohneramt | Residence certificate | [https://eservices.egov.bs.ch/pay/412/p/001/wohnsitzbescheinigung-bestellen](https://eservices.egov.bs.ch/pay/412/p/001/wohnsitzbescheinigung-bestellen) | Canton’s official certificate journey and indexed eService.  [bs](https://www.bs.ch/themen/persoenliches-und-wohnen/wohnen/wohnsitzbescheinigung-bestellen) | Einwohneramt task; application/payment operator unknown | Public information → order/card payment → emailed document; login requirement unknown | Application-specific information unknown | Compact information/form/payment/document chain | High task; medium endpoint status |
| Gemeinde Riehen | Municipal online services | [https://www.riehen.ch/verwaltung/onlineschalter.php](https://www.riehen.ch/verwaltung/onlineschalter.php) | Municipality’s own online counter.  [riehen](https://www.riehen.ch/verwaltung/onlineschalter.php) | Gemeindeverwaltung; technical operator unknown | Public catalogue; forms vary | Unknown | Services outside the canton’s main template | High |
| Gemeinde Bettingen | Municipal information and services | [https://www.bs.ch/bettingen](https://www.bs.ch/bettingen) | Official page identifies Bettingen as a separate Einwohnergemeinde.  [bs](https://www.bs.ch/bettingen) | Gemeindeverwaltung contact; technical operator unknown | Public → municipal forms | BS statement; form coverage unknown | Same domain, different accountable municipality | High |
| Bürgergemeinde Basel | Naturalisation, integration and social services | [https://bgbasel.ch/de/home.html](https://bgbasel.ch/de/home.html) | Own institutional description; BSB/Waisenhaus relationships documented.  [bgbasel](https://bgbasel.ch/de/home.html) | Central services/institutions; technical operator unknown | Public; downstream boundaries unknown | Central services joined action plan; not a site conformity claim.  [bs](https://www.bs.ch/medienmitteilungen/pd/2024-start-der-umsetzung-des-aktionsplans-barrierefreie-kommunikation) | Important non-executive public-service layer | High |
| Bürgergemeinde Riehen | Civic institution/contact | [https://www.buergergemeinde-riehen.ch/impressum.html](https://www.buergergemeinde-riehen.ch/impressum.html) | Imprint assigns content responsibility to Bürgergemeinde Riehen.  [buergergemeinde-riehen](https://www.buergergemeinde-riehen.ch/impressum.html) | Content controller named; technical operator unknown | Public | Unknown | Prevent conflation with Einwohnergemeinde Riehen | High content identity |
| Grosser Rat | Parliamentary information and participation | [https://grosserrat.bs.ch/](https://grosserrat.bs.ch/) | Official parliament site.  [grosserrat.bs](https://grosserrat.bs.ch/) | Parlamentsdienst contact; technical operator unknown | Public documents/media | Parliamentary service joined action plan.  [bs](https://www.bs.ch/medienmitteilungen/pd/2024-start-der-umsetzung-des-aktionsplans-barrierefreie-kommunikation) | Document search, proceedings and video accessibility | High |
| Basel-Stadt judiciary | Find court, appeal or conciliation route | [https://www.bs.ch/gerichte-judikative/ueber-die-gerichte](https://www.bs.ch/gerichte-judikative/ueber-die-gerichte) | Official description; court organisation law.  [bs](https://www.bs.ch/gerichte-judikative/ueber-die-gerichte) | Relevant court/body; judiciary IT listed separately, operational scope unknown.  [bs](https://www.bs.ch/gerichte-judikative/ueber-die-gerichte/gerichtsverwaltung) | Public guidance; filing boundaries vary | BS statement; courts joined action plan.  [bs](https://www.bs.ch/medienmitteilungen/pd/2024-start-der-umsetzung-des-aktionsplans-barrierefreie-kommunikation) | High-consequence routing and document access | High |
| Primarstufe Theodor / eduBS | School-specific childcare information | [https://schulen.edubs.ch/ps/theodor/tagesstruktur](https://schulen.edubs.ch/ps/theodor/tagesstruktur) | School page links its Tagesstruktur process.  [schulen.edubs](https://schulen.edubs.ch/ps/theodor/tagesstruktur) | School content; technical operator unknown | Public → separate portal | Unknown | Parent journey may start at school, not bs.ch | High task; medium governance detail |
| Education / Tagesstrukturen | Book school-care modules | [https://tagesstrukturportal.bs.ch/anmelden](https://tagesstrukturportal.bs.ch/anmelden) | Portal distinguishes Volksschule Basel-Stadt and Riehen/Bettingen registration.  [tagesstrukturportal.bs](https://tagesstrukturportal.bs.ch/anmelden) | Schülerkoordination identified in guidance; technical operator unknown.  [bs](https://www.bs.ch/themen/bildung-und-kinderbetreuung/kinderbetreuung/tagesstrukturen) | Login; initial registration and email instructions | Unknown | Registration, municipal branching and module-booking boundary | High |
| Universität Basel | Study/service discovery | [https://www.unibas.ch/](https://www.unibas.ch/) | Canton states joint BS/BL sponsorship since 2006.  [bs](https://www.bs.ch/fd/finanzverwaltung/eignerstrategien/universitaet-basel) | University Web Services publishes guidance; hosting unknown.  [unibas](https://www.unibas.ch/de/Universitaet/Administration-Services/Bereich-Rektorin/Kommunikation-Marketing/Web-Services/Web-Desk/Barrierefreiheit.html) | Public; authenticated services downstream | Published accessibility guidance, not a current audit certificate.  [unibas](https://www.unibas.ch/de/Universitaet/Administration-Services/Bereich-Rektorin/Kommunikation-Marketing/Web-Services/Web-Desk/Barrierefreiheit.html) | Independent systems and student journeys | High |
| FHNW | Education and institutional services | [https://www.fhnw.ch/de](https://www.fhnw.ch/de) | Public-law institution sponsored by AG, BL, BS and SO.  [fhnw](https://www.fhnw.ch/de/die-fhnw/portraet-organisation) | Institution established; technical operator unknown | Public; downstream authentication unknown | Unknown | Joint governance and multi-campus services | High |
| Naturhistorisches Museum Basel | Plan a museum visit | [https://www.nmbs.ch/de/museum.html](https://www.nmbs.ch/de/museum.html) | Museum identifies itself as cantonal; canton confirms departmental status.  [nmbs](https://www.nmbs.ch/de/museum.html) | Museum; technical operator unknown | Public; booking boundary not traced | Unknown | Independent presentation of a cantonal service | High |
| Bibliothek PZ.BS | Public specialist-library access | [https://www.bs.ch/ed/hochschulen/pzbs/mm/pzbs-bibliothek](https://www.bs.ch/ed/hochschulen/pzbs/mm/pzbs-bibliothek) | Officially part of Pädagogisches Zentrum PZ.BS.  [bs](https://www.bs.ch/ed/hochschulen/pzbs/mm/pzbs-bibliothek) | Library/PZ.BS; shared catalogue downstream | Public guidance → swisscovery | BS statement; catalogue separately unknown | Government service handed to shared infrastructure | High |
| Universität Basel / UB | Library registration guidance | [https://ub.unibas.ch/en/search-find/library-catalogues/swisscovery-registration-and-help/](https://ub.unibas.ch/en/search-find/library-catalogues/swisscovery-registration-and-help/) | University library; canton documents university’s cantonal-library mandate.  [ub.unibas](https://ub.unibas.ch/en/search-find/library-catalogues/swisscovery-registration-and-help/) | UB support; SLSP operates swisscovery.  [ub.unibas](https://ub.unibas.ch/en/search-find/library-catalogues/swisscovery-registration-and-help/) | Public guidance → Switch/SLSP registration | Unknown | Distinguish local support from platform responsibility | High |
| SLSP | Register for shared library services | [https://registration.slsp.ch/](https://registration.slsp.ch/) | SLSP terms and institutional library explanation establish service relationship—not cantonal ownership.  [ub.unibas](https://ub.unibas.ch/en/search-find/library-catalogues/swisscovery-registration-and-help/) | SLSP registration; Switch identity boundary | Public entry → Switch edu-ID → data-transfer consent | Unknown | Shared platform serving local public institutions | High |
| BVB | Accessible journey planning | [https://www.bvb.ch/de/service/rollstuhl/](https://www.bvb.ch/de/service/rollstuhl/) | Current cantonal BVB owner strategy.  [bs](https://www.bs.ch/fd/finanzverwaltung/eignerstrategien) | Imprint names BVB as publisher and design/development organisation; hosting unknown.  [bvb](https://www.bvb.ch/de/unternehmen/impressum/) | Public → SBB timetable/telephone assistance | Passenger-access information; digital conformity unknown.  [bvb](https://www.bvb.ch/de/service/rollstuhl/) | Digital planning must support actual accessible travel | High |
| IWB | Notify utility-related move | [https://www.iwb.ch/servicecenter/umzug-liegenschaftsverwaltung/umzug-und--mieterwechsel/umzug-melden](https://www.iwb.ch/servicecenter/umzug-liegenschaftsverwaltung/umzug-und--mieterwechsel/umzug-melden) | Canton explicitly identifies IWB as canton-owned public-law institution.  [bs](https://www.bs.ch/wsu/kantonale-beteiligungen-wsu) | IWB service; form supplier/hosting unknown | Public four-stage form; later boundary untested.  [iwb](https://www.iwb.ch/servicecenter/umzug-liegenschaftsverwaltung/umzug-und--mieterwechsel/umzug-melden) | Unknown | Moving home extends beyond resident registration | High |
| Universitätsspital Basel | Patient portal discovery | [https://www.unispital-basel.ch/patient-innen---besuchende/myusb](https://www.unispital-basel.ch/patient-innen---besuchende/myusb) | USB public-law status stated in privacy policy.  [unispital-basel](https://www.unispital-basel.ch/datenschutz) | Website responsibility: USB Marketing & Kommunikation; portal supplier unknown.  [unispital-basel](https://www.unispital-basel.ch/impressum) | Public explanation → identification/registration → browser/app medical records | Unknown | Health, identity, apps and document boundaries | High |
| Open Data Basel-Stadt | Public data discovery | [https://data.bs.ch/](https://data.bs.ch/) | Official cantonal OGD portal.  [data.bs](https://data.bs.ch/) | DCC, Statistisches Amt explicitly operates portal; technical vendor unknown | Public catalogue/downloads | Unknown | Dataset producers and service relationships | High |
| Geoinformation / GVA | Discover geodata, maps and restricted data | [https://www.bs.ch/bvd/grundbuch-und-vermessungsamt/geo/geodaten](https://www.bs.ch/bvd/grundbuch-und-vermessungsamt/geo/geodaten) | Official cantonal geodata service.  [bs](https://www.bs.ch/bvd/grundbuch-und-vermessungsamt/geo/geodaten) | GVA coordination; specialist offices approve restricted access | Public catalogue → MapBS/shop; restricted data require approval/login | BS statement; downstream apps unknown | Multiple apps and access levels concealed by one topic | High |
| Stadtreinigung / Tiefbauamt | Container ordering and chipping | [https://entsorgung.egov.bs.ch/](https://entsorgung.egov.bs.ch/) | Portal states Stadtreinigung service.  [entsorgung.egov.bs](https://entsorgung.egov.bs.ch/) | Responsible service identified; technical operator unknown | Public explanation → transaction; login unverified | Unknown | Distinct from ordinary waste-date lookup | High task; medium boundary |
| Steuerverwaltung | Taxes / BalTax | [https://www.esteuern.bs.ch/private](https://www.esteuern.bs.ch/private) | Official tax guidance names exact portal.  [bs](https://www.bs.ch/themen/arbeit-und-steuern/steuererklaerung/steuererklaerung-als-natuerliche-person-einreichen) | Steuerverwaltung; software/hosting supplier unknown | Public guidance → ePortal/AGOV → tax data and supporting documents.  [bs](https://www.bs.ch/themen/arbeit-und-steuern/steuererklaerung/steuererklaerung-natuerliche-person/steuerportal-und-baltax-online) | Unknown | Consequential authentication/document journey | High |
| Bau- und Gastgewerbeinspektorat | Building application assistant | [https://jaxforms.cloud.bs.ch/formservice/services/rest/template/public/KTBS/de/index.html](https://jaxforms.cloud.bs.ch/formservice/services/rest/template/public/KTBS/de/index.html) | BGI task/contact published in application.  [jaxforms.cloud.bs](https://jaxforms.cloud.bs.ch/formservice/services/rest/template/public/KTBS/de/index.html) | BGI responsible; technical operator unknown—hostname is not proof | Public introduction; later application boundary untested | Unknown | Possible legacy/live-route conflict and print boundary | Medium; current intended route unresolved |
| Basel Tourismus | Visitor information | [https://www.basel.com/de/barrierefreiheit](https://www.basel.com/de/barrierefreiheit) | Statement identifies Basel Tourismus; legal sponsorship not established here.  [basel](https://www.basel.com/de/barrierefreiheit) | Basel Tourismus declares responsibility; technical operator unknown | Public; booking boundaries untraced | Dated 25 June 2025; partial WCAG 2.2 compatibility and listed issues | Relevant regional/public-facing service, not presumed government-owned | High publisher; unknown sponsorship |
| Amt für Sozialbeiträge | Rent-benefit application | [https://www.bs.ch/themen/finanzielle-hilfe/leistungen/mietbeitraege](https://www.bs.ch/themen/finanzielle-hilfe/leistungen/mietbeitraege) | Official page names ASB as assessing authority.  [bs](https://www.bs.ch/themen/finanzielle-hilfe/leistungen/mietbeitraege) | ASB; calculator/document operators unknown | Public eligibility → calculator/downloaded application → submission route to verify | BS statement; actual application PDF untested | Cognitive load, supporting evidence and non-portal exclusion | High |

Additional expansion targets, not yet equivalent verified property records: UKBB, UPK, Universitäre Altersmedizin FELIX PLATTER, BSB, Bürgerliches Waisenhaus, Christoph Merian Stiftung, the other four cantonal museums, and participation-linked services such as Schweizerische Rheinhäfen. Current institutional sources establish why these belong in discovery; each still needs its own service/operator record. CMS, for example, is an independent foundation under Bürgergemeinde supervision—not simply another Bürgergemeinde department. [bs](https://www.bs.ch/wsu/kantonale-beteiligungen-wsu)

## C. Ten discovery sources, ranked

Ranking prioritises responsibility discovery and actionable service boundaries over URL volume.

| Rank | Source and direct link | Publication/update evidence | What it reveals that ordinary crawling misses |
|---|---|---|---|
| 1 | [Staatskalender](https://staatskalender.bs.ch/) alongside [Organisation](https://www.bs.ch/organisation) | Live directories; publication date unknown | Organisational hierarchy and accountable offices, including relationships unrelated to site navigation. Use organisation records only; personal-contact harvesting is unnecessary.  [staatskalender.bs](https://staatskalender.bs.ch/) |
| 2 | [Eignerstrategien](https://www.bs.ch/fd/finanzverwaltung/eignerstrategien) | Updated 13 August 2026; includes BVB 2026–2029 and BKB 2025–2029 strategies | Connects independent institutions to policy departments and owner oversight. More informative than a government backlink.  [bs](https://www.bs.ch/fd/finanzverwaltung/eignerstrategien) |
| 3 | [Financial administration: participation management and annual reporting](https://www.bs.ch/fd/finanzverwaltung) | Updated 20 October 2026; linked participation report covers 2024 | Finds participations and financial relationships outside the main site. The 2024 report’s 46 enterprises are a historical financial population, not 46 current sites; it excludes sub-participations.  [bs](https://www.bs.ch/fd/finanzverwaltung) |
| 4 | [ePortal catalogue](https://eportal.egov.bs.ch/) | Live; publication date unknown | Distinguishes simple forms, specialist portals, no-registration services and AGOV-protected services. Search/navigation relationships matter more than subdomain enumeration.  [eportal.egov.bs](https://eportal.egov.bs.ch/) |
| 5 | [Accessibility statement](https://www.bs.ch/erklaerung-zur-barrierefreiheit) and [barrier-free communication programme](https://www.bs.ch/pd/gleichstellung-und-diversitaet/rechte-von-menschen-mit-behinderungen/barrierefreie-kommunikation) | Programme adopted 30 January 2024; implementation announcement 3 December 2024; measures 2025–2028 | Existing defect categories, remediation ownership and participating bodies. Also shows where a shared institutional programme crosses independent websites.  [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit) |
| 6 | Official task pages and their outbound links: [moving into the canton](https://www.bs.ch/themen/persoenliches-und-wohnen/zuzug-und-aufenthalt/zuzug-den-kanton-basel-stadt), [Tagesstrukturen](https://www.bs.ch/themen/bildung-und-kinderbetreuung/kinderbetreuung/tagesstrukturen) | Current pages; reliable publication dates unknown | Eligibility branching, upload requirements, appointment/payment steps and municipal alternatives that an indiscriminate crawl will flatten.  [bs](https://www.bs.ch/themen/persoenliches-und-wohnen/zuzug-und-aufenthalt/zuzug-den-kanton-basel-stadt) |
| 7 | [Riehen online counter](https://www.riehen.ch/verwaltung/onlineschalter.php), [Bettingen](https://www.bs.ch/bettingen), [Bürgergemeinde institutional map](https://bgbasel.ch/unter-einem-dach/auf-einen-blick.html) | Live pages; Bürgergemeinde page indexed with 19 December 2024 date, not independently confirmed as publication date | Municipal services and institution/supervision relationships absent from a canton-only crawl.  [riehen](https://www.riehen.ch/verwaltung/onlineschalter.php) |
| 8 | [OGD catalogue](https://data.bs.ch/) and [geodata discovery](https://www.bs.ch/bvd/grundbuch-und-vermessungsamt/geo/geodaten) | Live; publication dates unknown | Data producers, specialist responsibility, APIs/downloads, maps, shops and restricted-access services. The geodata overview explicitly distinguishes public from approval-controlled access.  [data.bs](https://data.bs.ch/) |
| 9 | [KFöB procurement office](https://www.bs.ch/bvd/generalsekretariat/kantonale-fachstelle-fuer-oeffentliche-beschaffungen-kfoeb) → [simap](https://www.simap.ch/) | Live office page; publication date unknown | Notices and awards can identify commissioning authority, delivery scope and contracted suppliers. An award does not by itself prove who currently hosts or maintains a service. KFöB identifies itself as Basel-Stadt’s simap competence centre.  [bs](https://www.bs.ch/bvd/generalsekretariat/kantonale-fachstelle-fuer-oeffentliche-beschaffungen-kfoeb) |
| 10 | Institution-specific legal notices, statutes, terms and annual reports: [USB privacy](https://www.unispital-basel.ch/datenschutz), [FHNW governance](https://www.fhnw.ch/de/die-fhnw/portraet-organisation), [SLSP terms](https://slsp.ch/en/terms-of-use-swisscovery/) | Live versions; publication dates unknown | Separates legal form, controller, local service support, identity provider and platform operator. This is essential for outsourced/shared delivery.  [unispital-basel](https://www.unispital-basel.ch/datenschutz) |

### Legacy domains, apps and embedded services

Several concrete leads deserve explicit records:

- `ekonto.egov.bs.ch` currently exposes the same ePortal description in search. Treat it as an alternate/legacy relationship to resolve, not automatically another service or confirmed redirect. [ekonto.egov.bs](https://ekonto.egov.bs.ch/)
- `formulare.bs.ch/bettingen/wohnsitzbescheinigung-bestellen` was indexed with a maintenance message. That is an availability lead, not evidence of permanent retirement or an accessibility defect. [formulare.bs](https://formulare.bs.ch/bettingen/wohnsitzbescheinigung-bestellen)
- A 2022 BGI leaflet references `www.bgi.bs.ch`, while current BGI content lives under `bs.ch/bvd/bgi`. Record the old hostname as a historical discovery lead. [bs](https://www.bs.ch/bvd/bgi)
- Dräggwägg, myUSB and the Tagesstruktur portal extend public tasks beyond the main website. Browser pages do not establish native-app accessibility. [tagesstrukturportal.bs](https://tagesstrukturportal.bs.ch/anmelden)
- The canton’s own statement identifies embedded external content as a problem category. Inventory each embedding page and external service separately; the statement does not identify which individual embeds fail. [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit)

Sitemaps are useful for URL inventory and migration reconciliation, but this research did not verify a specific sitemap endpoint or find a comprehensive official public-sector website register. Do not substitute guessed sitemap paths or domain lists for the institutional sources above.

## D. Five promising task-based pilot cases

These are proposed cases, not claims that the services fail.

### 1. Obtain a residence certificate

Journey:

[Public instructions](https://www.bs.ch/themen/persoenliches-und-wohnen/wohnen/wohnsitzbescheinigung-bestellen) → choose simple/extended certificate and check eligibility → [eService](https://eservices.egov.bs.ch/pay/412/p/001/wohnsitzbescheinigung-bestellen) → card payment → certificate delivered by email.

The instructions state a CHF 20 fee, card payment and email delivery. They exclude weekly residents and identify a counter alternative for immediate/physical documents. Page last updated: 3 September 2026. [bs](https://www.bs.ch/themen/persoenliches-und-wohnen/wohnen/wohnsitzbescheinigung-bestellen)

- Responsibility/platform change: Einwohneramt information on `bs.ch` → transaction application on `eservices.egov.bs.ch` → payment boundary → delivered document.
- Why useful: a compact, consequential chain with clear outputs and several reusable boundary types.
- Pilot evidence: discoverability, distinction between certificate types, prerequisite clarity, public form naming/instructions and availability of accessible alternatives.
- Limitation: passive research cannot establish payment usability or accessibility of the delivered certificate. Payment provider and technical operator remain unknown.

### 2. Register a child for school Tagesstrukturen

Journey:

[Eligibility, modules and costs](https://www.bs.ch/themen/bildung-und-kinderbetreuung/kinderbetreuung/tagesstrukturen) → [request Basel-Stadt portal login](https://eservices.egov.bs.ch/e/21827/p/001/registrierung-fuer-das-login-zum-tagesstruktur-portal) → email login instructions → [Tagesstruktur portal](https://tagesstrukturportal.bs.ch/anmelden) → book modules.

The portal distinguishes Basel-Stadt Volksschule registration from Gemeindeschulen Bettingen/Riehen. This is a valuable example of a single apparent service branching by municipal responsibility. [tagesstrukturportal.bs](https://tagesstrukturportal.bs.ch/anmelden)

- Responsibility/platform change: education guidance and Schülerkoordination → eService registration → separate portal; municipal alternative for Riehen/Bettingen.
- Why useful: parent-facing, time-sensitive and structurally different from tax/AGOV services.
- Pilot evidence: compare the route from a school page with the route from `bs.ch`; document whether prerequisites and municipal branches agree.
- Limitation: no registration or child data. Module selection, error recovery and account emails remain unassessed. Do not conflate school Tagesstrukturen with Kita/Tagesfamilien subsidies, which have a different responsible specialist office. [schulen.edubs](https://schulen.edubs.ch/ps/theodor/tagesstruktur)

### 3. Find an applicable financial benefit and reach its application

Journey:

[Rent-benefit eligibility](https://www.bs.ch/themen/finanzielle-hilfe/leistungen/mietbeitraege) → social-benefit calculator → application/leaflet download → supporting-document and submission boundary.

The official page identifies the Amt für Sozialbeiträge as assessing authority and links a downloadable application and eligibility leaflet. [bs](https://www.bs.ch/themen/finanzielle-hilfe/leistungen/mietbeitraege)

- Responsibility/platform change: ASB information → calculator, whose operator was not established → downloaded application → administrative submission.
- Why useful: tests whether your toolkit can detect exclusion outside modern portals—especially document dependence and understanding prerequisites.
- Pilot evidence: a prerequisite checklist derived from official sources; PDF structure checks; manual review of reading order, understandable instructions and consistency with the information page.
- Limitation: do not enter financial details or derive household entitlements. The exact submission and supporting-document route needs further public-document inspection.

### 4. Find the next correct waste collection and request the relevant service

Journey:

[Waste-collection information](https://www.bs.ch/themen/umwelt-und-bauen/abfall-und-sauberkeit/abfallabfuhr) → zone/address lookup or map → collection schedule/PDF; separately, [Entsorgungsportal](https://entsorgung.egov.bs.ch/) for container ordering/chipping.

The main page also points to Riehen/Bettingen schedules and the Dräggwägg app. The public [collection-date dataset](https://data.bs.ch/explore/assets/100096/) names Stadtreinigung/Tiefbauamt as the service context. [entsorgung.egov.bs](https://entsorgung.egov.bs.ch/)

- Responsibility/platform change: Stadtreinigung information → geographic lookup/map → PDF or app; specialised container transaction elsewhere.
- Why useful: frequent task, low sensitivity and a good test of whether equivalent information survives changes in format.
- Pilot evidence: using a published public-building location, compare discoverability of zone and date across public HTML, map, PDF and OGD.
- Limitation: container orders are not the same task as finding collection dates. OGD consistency is useful evidence but not proof that the user interface is accessible.

### 5. Prepare to file taxes through BalTax/AGOV

Journey:

[Tax-declaration instructions](https://www.bs.ch/themen/arbeit-und-steuern/steuererklaerung/steuererklaerung-als-natuerliche-person-einreichen) → [eSteuern](https://www.esteuern.bs.ch/private) → AGOV → BalTax → supporting documents and electronic transmission.

Official guidance explicitly requires ePortal/AGOV for BalTax Online, describes document digitisation and retains paper filing as an alternative. BalTax Online 2025 became available on 2 February 2026. [bs](https://www.bs.ch/themen/arbeit-und-steuern/steuererklaerung/steuererklaerung-als-natuerliche-person-einreichen)

- Responsibility/platform change: Steuerverwaltung guidance → tax portal → shared identity service → authenticated declaration and documents.
- Why useful: high-consequence task and a strong test of whether your map accurately marks where its evidence stops.
- Pilot evidence: public prerequisite clarity, registration instructions, assistance routes and alternative-channel discoverability.
- Limitation: under the present scope, this is a pre-authentication pilot only. Do not report declaration-form accessibility from the public instructions.

Moving-home discovery should accompany these cases: the [incoming-resident page](https://www.bs.ch/themen/persoenliches-und-wohnen/zuzug-und-aufenthalt/zuzug-den-kanton-basel-stadt) describes eligibility branching, uploads, an AWN finder, appointment booking and payment; it also says the form cannot be saved midway. IWB requires a separate utility move notification. These are substantial gaps in a simple “moving home = eUmzug” model. [iwb](https://www.iwb.ch/servicecenter/umzug-liegenschaftsverwaltung/umzug-und--mieterwechsel/umzug-melden)

Parking and business permits should remain in the next discovery tranche: the [parking catalogue](https://www.bs.ch/themen/mobilitaet/fahren-und-parkieren/parkkarten) distinguishes several user/permit categories, including Riehen; [hospitality permits](https://www.bs.ch/bvd/bgi/gastgewerbebewilligungen) branch by public/private land and business type. Neither should be represented by one generic “apply for permit” journey. [bs](https://www.bs.ch/themen/mobilitaet/fahren-und-parkieren/parkkarten)

## E. Existing work and plausible partners

No willingness to participate is assumed.

| Initiative / possible partner | Established relevant role | What a small pilot could add |
|---|---|---|
| Gleichstellung und Diversität / rights of people with disabilities | Action-plan coordination context; 2025–2028 programme.  [bs](https://www.bs.ch/pd/gleichstellung-und-diversitaet/rechte-von-menschen-mit-behinderungen/barrierefreie-kommunikation) | Evidence connecting programme objectives to concrete service boundaries and accountable remediation |
| Behindertenforum Region Basel | Worked with disabled people on developing the action plan; continued involvement in implementation is stated in the 3 December 2024 announcement.  [bs](https://www.bs.ch/medienmitteilungen/pd/2024-start-der-umsetzung-des-aktionsplans-barrierefreie-kommunikation) | Help prioritise affected-user needs and shape a future consented AT-user validation phase |
| Cantonal Webredaktion and departmental content teams | Accessibility statement names contact and divides code versus semantic/content remediation.  [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit) | Owner-routable findings instead of undifferentiated WCAG issue lists |
| Stiftung Zugang für alle | Swiss digital-accessibility expertise, auditing and certification; published Swiss accessibility studies.  [access-for-all](https://access-for-all.ch/) | Independent review of test methods, AT validation and avoiding duplicate audits |
| Universität Basel Web Services and UB | University publishes accessibility guidance; UB documents local/shared library responsibility and registration support.  [unibas](https://www.unibas.ch/de/Universitaet/Administration-Services/Bereich-Rektorin/Kommunikation-Marketing/Web-Services/Web-Desk/Barrierefreiheit.html) | A multi-organisation library journey or independent review of interaction findings |
| KFöB and the commissioning service office | KFöB coordinates/advises public procurement and supports simap use.  [bs](https://www.bs.ch/bvd/generalsekretariat/kantonale-fachstelle-fuer-oeffentliche-beschaffungen-kfoeb) | Trace a verified defect to an acceptance requirement, contract scope and current maintenance responsibility |
| DCC / Open Data Basel-Stadt | Explicitly operates the OGD portal.  [data.bs](https://data.bs.ch/) | Provenance schema, dataset/service relationships and evidence publication practices |
| A task-owning office: Einwohneramt, ASB or Schülerkoordination | Official pages identify their service responsibilities.  [bs](https://www.bs.ch/jsd/bdm/bevoelkerungsamt/einwohneramt) | Validate whether the journey map matches operational reality and whether findings are actionable |

### What is already published—and what remains unknown

- Basel-Stadt’s public statement is an existing self-assessment and improvement commitment, not an independently verified comprehensive audit. It declares WCAG 2.1 AA/eCH-0059 v3.0 and PDF/UA objectives while acknowledging partial conformity. [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit)
- The action plan arose from a 2023 baseline assessment. Its announcement documents participation by people with disabilities, but this is not equivalent to a published task-by-task screen-reader usability study. [bs](https://www.bs.ch/medienmitteilungen/pd/2024-start-der-umsetzung-des-aktionsplans-barrierefreie-kommunikation)
- Zugang für alle’s 2023 mobile-app study combines standards-oriented examination with disabled users’ experience. It supplies a methodological precedent; its aggregate results should not be applied to untested Basel services. [as23.access-for-all](https://as23.access-for-all.ch/)
- Universität Basel’s guidance discusses WCAG 2.0 and 2.1 and links specialist resources. Its presence is not evidence of a recent institution-wide audit or certification. [unibas](https://www.unibas.ch/de/Universitaet/Administration-Services/Bereich-Rektorin/Kommunikation-Marketing/Web-Services/Web-Desk/Barrierefreiheit.html)
- Basel Tourismus publishes an accessibility statement created on 25 June 2025, including specific shortcomings. That provides a comparison case, not proof of cantonal ownership or shared remediation responsibility. [basel](https://www.basel.com/de/barrierefreiheit)
- Basel-Landschaft explicitly reports regular sampling by Zugang für alle. This is useful neighbouring practice, but belongs in a separate jurisdiction record—not the Basel-Stadt audit inventory. [baselland](https://www.baselland.ch/barrierefreiheit)

I did not establish a current public certification covering all `bs.ch` services, a published comprehensive ePortal audit, a Basel-specific service-wide AT-user study, or a specific awarded procurement’s accessibility acceptance clauses.

The canton’s declared standards and eCH-0059’s requirements are evidence of standards expectations. They are not proof that every supplier contract incorporates them or that an acceptance test was performed. Version 3.0 of eCH-0059 was approved on 25 June 2020. [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit)

## F. Five challenges to your assumptions

### 1. Your sample may overrepresent one design system and underrepresent the actual public task

Twelve public pages can offer repeated exposure to the same navigation while missing school portals, shared-library registration, native health apps, utility forms and municipal variants.

The uncovered affected users are not only screen-reader users: consider parents under time pressure, people with cognitive or learning disabilities, Deaf users needing signed information, people with limited German, older residents, people without usable digital identity, and representatives acting for others. The existing programme itself distinguishes accessible language, sign language and different communication needs. [bs](https://www.bs.ch/pd/gleichstellung-und-diversitaet/rechte-von-menschen-mit-behinderungen/barrierefreie-kommunikation)

Research consequence: stratify by task, boundary, user need and platform family—not merely department or hostname.

### 2. Website counts are a poor denominator

One `bs.ch` domain contains multiple authorities, including Bettingen and the judiciary. One library task crosses UB, SLSP and Switch. One healthcare task may span web and native app. Conversely, `ekonto` and `eportal` may represent overlapping entry points. [bs](https://www.bs.ch/bettingen)

Research consequence: publish separate counts for organisations, public tasks, platform families, unique interfaces and observed journey boundaries. Keep alias resolution provisional.

### 3. Public extraction artefacts are not accessibility findings

The ePortal text retrieval exposed untranslated-looking keys such as `e-portal.welcome.title`. That is a useful lead, but it could reflect rendering/localisation/extraction behaviour rather than the experience presented to an actual browser or assistive technology. [eportal.egov.bs](https://eportal.egov.bs.ch/)

Likewise, a screenshot cannot establish accessible names, focus order or error announcements.

Before claiming failure, validate:

- Unlabelled-looking icons against the computed accessible name and actual control purpose.
- Hidden or duplicated content against its rendered state and accessibility-tree exposure.
- Contrast against actual foreground/background, state and text size.
- Focus visibility, keyboard traps and modal behaviour through interaction.
- Live updates and errors using supported browser/AT combinations.
- PDF usability beyond a successful text extraction, including tags, order and form semantics.

Research consequence: keep “deterministic evidence”, “interaction needed”, “AT validation needed” and “extraction uncertainty” as separate statuses.

### 4. Knowing the public authority does not identify the technical fix owner

Basel-Stadt’s own statement splits supplier-assisted code remediation from departmental structural/content work. Shared platforms introduce additional organisations. A logo, hostname or imprint generally cannot resolve the whole chain. [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit)

Research consequence: model separate edges for legal sponsorship, service accountability, content responsibility, platform operation, identity provision and technical maintenance. Permit unknown edges rather than manufacturing a complete diagram.

### 5. A technically impressive map may not answer a government partner’s operational question

The BGI/OBG conflict illustrates a valuable result: “Which route should residents use today, who can correct the contradictory instruction, and which application must be tested?” That may be more actionable than hundreds of low-context markup observations. [bs](https://www.bs.ch/bvd/bgi)

Research consequence: every candidate finding should carry the affected task, user impact, exact state/URL, reproducible evidence, likely responsible team, unresolved uncertainty and a retest condition. Do not rank departments by raw automated issue counts.

### Best next research step

Run one tightly bounded residence-certificate discovery pilot before expanding scanning.

Produce a small evidence packet with:

1. A journey graph from official information through the public transaction entry, explicitly marking payment and emailed-document boundaries as untested.
2. Separate records for legal authority, task owner, content owner and technical operator; retain unknowns.
3. A public-page evidence ledger containing source URL, exact supporting excerpt, document/page date, retrieval date and confidence.
4. Deterministic findings separated from interaction hypotheses and AT-validation requirements.
5. A concise list of factual questions for the Einwohneramt/Webredaktion: intended production route, current application maintainer, existing audit coverage and accessible document-delivery process.

The official journey is compact enough to expose whether your discovery model can connect a useful task to actionable responsibility without claiming access to payment, identity or delivered documents. [bs](https://www.bs.ch/themen/persoenliches-und-wohnen/wohnen/wohnsitzbescheinigung-bestellen)

Success would be one verified cross-boundary service record and a small number of correctly routed, reproducible observations—not another accessibility score or a larger domain count.