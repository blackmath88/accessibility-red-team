# Supplied Basel research — stakeholders-and-standards

Received: 2026-10-29. Source: owner-supplied Perplexity research report.
Status: research input, NOT a validated repository fact, accepted legal interpretation, ownership authority or testing permission.
The original text follows unchanged. Source links and claimed retrieval dates belong to the report's author;
verify material claims against dated primary evidence before adding them to the requirements/stakeholder ledger.
A current public page does not prove current contract, maintenance, approval or complete-process accessibility.
Do not contact named people from this document without owner instruction.

---

Basel-Stadt’s digital-accessibility responsibility is **distributed**: cantonal law establishes the duty; the disability-rights office coordinates and monitors implementation; the Staatskanzlei owns the central website function; IT BS operates the ePortal and shared digital infrastructure; and departments and municipalities remain responsible for their own services and communications. The public evidence does not establish a single canton-wide accessibility acceptance authority or remediation budget. [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500)

For a small pilot, the most defensible starting configuration is therefore a named service owner, the relevant platform owner, and the Fachstelle Rechte von Menschen mit Behinderungen—not an assumption that one central web team can authorize, fix and accept everything.

Research cut-off: 29 October 2026. This is a public-source stakeholder and requirements map, not a compliance audit or definitive legal opinion. “Unknown” below means not established by the documents inspected, not necessarily absent in practice. Citations link to the underlying documents; legal sections and document dates are specified alongside them. No one was contacted.

## A. Requirements matrix

### A1. Legal obligations and administrative implementation

| Requirement | Version/date | Authority/source | Binding status | Applicable bodies/services | Documented responsible role | Uncertainty |
|---|---|---|---|---|---|---|
| Non-discrimination and accessibility of public facilities/services | Kantonsverfassung, 23 March 2005; § 8(2)–(3) | Basel’s official account identifies § 8 as the constitutional basis.  [bs](https://www.bs.ch/pd/gleichstellung-und-diversitaet/rechte-von-menschen-mit-behinderungen) | Constitutional obligation | Canton and public-authority activity; concrete digital duties are developed in BRG/BRV | Public bodies exercising the relevant responsibility | Constitution is not itself a technical WCAG acceptance specification. |
| Prevent, eliminate or reduce disadvantage; accessible services and communication | BRG, SG 140.500, 18 September 2019; consolidated text “Stand 1. Januar 2021”; §§ 4–7 | Grosse Rat; current consolidated legal text.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500) | Legally binding; § 7 requires proportionality assessment | § 4(2): canton, municipalities, bodies performing public tasks, and providers of publicly accessible services. § 6(4) expressly covers ICT, including the internet | Each covered provider/body—not exclusively the Fachstelle | Institution-specific application may require examination of its mandate and legal arrangements. Ownership alone is not the statutory test. |
| Understandable communication and assistance on request | BRG § 6(2)–(3), same version | Assistance includes sign-language interpretation, understandable documents and oral explanation.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500) | Legally binding, subject to the statutory framework | Same § 4(2) bodies; concrete communications and services | Provider of the communication/service | A technically conformant interface does not alone discharge these wider communication duties. |
| Internet information, communication and transactions must be accessible and follow national IT standards, particularly eCH accessibility standards | BRV, SG 140.510, 23 June 2020; effective 1 January 2021; § 1 | Regierungsrat; ordinance text, p. 1.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/api/de/versions/5061/pdf_file) | Legally binding incorporation/reference to standards | Internet offers under BRG § 6(4), including information and transactional services | Body supplying the internet service | Ordinance does not name a numbered eCH edition. The explicit version used on bs.ch is established separately below. |
| Rights enforcement and organizational standing | BRG §§ 8–11; BRV § 2 | Individuals can seek prohibition, removal or determination of disadvantage. BRV names Pro Infirmis Basel-Stadt, Dorneck und Thierstein and Behindertenforum Region Basel as eligible organizations.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500) | Statutory remedies | Covered services; procedural route depends on the case | Competent administrative authority/court; eligible organizations can bring claims | Neither the Webredaktion inbox nor a pilot report substitutes for a formal legal remedy. |
| Coordination, monitoring, advice, participation and recommendations | BRG §§ 12–15; BRV § 3 | Fachstelle in the Präsidialdepartement; departmental and municipal representatives in a Begleitgruppe.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500) | Statutory governance duties | Canton, municipalities and other covered bodies; significant projects trigger early information under § 15 | Regierungsrat sets priorities; Fachstelle coordinates/monitors/advises; Begleitgruppe connects departments and municipalities | This does not establish the Fachstelle as software release approver or procurement signatory. |
| Aktionsplan Barrierefreie Kommunikation | Adopted 30 January 2024; implementation 1 January 2025–2028 | RRB P240060, operative point 1; official plan page, “Wer steht hinter dem Aktionsplan,” updated 8 December 2025.  [bs](https://www.bs.ch/api/government-resolutions/document/ff47c9d111e940dc8c619623dda1fcc7-332/3/Dokument) | Executive implementation mandate/administrative programme; not a replacement for statutory duties | All publicly communicating departmental and municipal offices. Courts, Bürgergemeinde Basel’s Zentralen Dienste, Ombudsstelle, parliamentary service and data-protection commissioner also joined | Implementing offices in their own areas; Fachstelle coordinated preparation | RRB refers to an implementation concept and annual plans. Their detailed allocation of budgets, measures and acceptance responsibilities was not established. |
| Cantonal IT-project governance | IT-PM.BS V3.0, January 2024, based on HERMES 2022 | § 1/p. 3 declares the guide mandatory; § 2.4.1/pp. 10–12 defines project roles.  [bs](https://www.bs.ch/media/21762) | Binding internal administrative framework, not a general law for all institutions | Cantonal administrative offices and operations without separate legal personality | Auftraggeber: overall responsibility/resources; Projektleitung: procurement, quality/risk and SLA checks; Anwendervertretung: solution requirements | Does not automatically extend to municipalities or separately incorporated institutions. Actual project appointments remain necessary. |
| Public procurement framework | IVöB of 15 November 2019, SG 914.600; Basel effective 1 February 2024; EG IVöB SG 914.200; EV IVöB SG 914.210 | KFöB, “Rechtsgrundlagen öffentliche Beschaffungen,” updated 13 October 2026; legal collection.  [bs](https://www.bs.ch/bvd/generalsekretariat/kantonale-fachstelle-fuer-oeffentliche-beschaffungen-kfoeb) | Legally binding procurement rules | Public purchasers within each instrument’s scope; KFöB supports departments and participating agreement partners | Procuring/commissioning body and KFöB for procedure; project leadership for project procurement | No inspected tender or signed contract establishes a universal Basel accessibility warranty, defect SLA or accessibility-specific acceptance gate. |

A date discrepancy matters here: an older December 2023 press release announced procurement-law commencement on 1 January 2024. The current KFöB page and legal collection give 1 February 2024; this map uses those current legal/administrative sources. [bs](https://www.bs.ch/bvd/generalsekretariat/kantonale-fachstelle-fuer-oeffentliche-beschaffungen-kfoeb)

### A2. Exact technical standards and their status

| Requirement | Version/date | Authority/source | Binding status | Applicable bodies/services | Documented responsible role | Uncertainty |
|---|---|---|---|---|---|---|
| eCH accessibility standard | eCH-0059 V3.0; approved 4 June 2020; published 25 June 2020 | Standard title page; §§ 1.2, 2–3. Official eCH catalogue still lists V3.0 as approved.  [ech](https://www.ech.ch/sites/default/files/dosvers/hauptdokument/STAN_d_DEF_2020-05-19_eCH-0059_V3.0_Accessibility%20Standard.pdf) | Not legislation merely because eCH publishes it. Basel BRV § 1 supplies the legal reference; bs.ch explicitly names V3.0 | Websites/mobile applications within scope; documents, forms, authentication, identification and payment processes | Service-providing body and implementing teams | Pin the applicable edition in each contract and project baseline rather than relying on “current WCAG” wording. |
| Web/mobile conformance | WCAG 2.1, level AA | eCH-0059 V3.0 § 2.2, p. 8; bs.ch statement “Standards und Vorgaben.”  [ech](https://www.ech.ch/sites/default/files/dosvers/hauptdokument/STAN_d_DEF_2020-05-19_eCH-0059_V3.0_Accessibility%20Standard.pdf) | Normative technical requirement through the applicable standard; explicitly declared cantonal baseline on bs.ch | Entire pages/screens and complete processes, including all A and AA criteria | Service/platform implementation; precise acceptance signatory not publicly established | No inspected Basel instrument establishes WCAG 2.2 as the compulsory canton-wide baseline. Do not silently substitute it for 2.1. |
| Published documents | WCAG 2.1; PDF/UA recommended as ISO 14289-1 | eCH-0059 V3.0 § 2.3, p. 9.  [ech](https://www.ech.ch/sites/default/files/dosvers/hauptdokument/STAN_d_DEF_2020-05-19_eCH-0059_V3.0_Accessibility%20Standard.pdf) | Accessible published documents are required by the standard; PDF/UA is worded as a recommendation within eCH | Published PDF, Office and equivalent documents within the standard’s scope | Publishing office/document authoring workflow | eCH names ISO 14289-1 but does not specify its publication-year edition here. |
| Generated documents on bs.ch | “PDF/UA,” no exact ISO edition stated | bs.ch declaration, “Standards und Vorgaben.”  [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit) | Publicly declared administrative target; not proof of compliance or a verified supplier contract clause | Statement says “alle generierten Dokumente” | Producing/publishing units; technical generation owner where applicable | PDF/UA-1 versus PDF/UA-2 and exact ISO edition are not resolved by this declaration. Do not invent an exact Basel PDF baseline. |
| Easy Language and sign language | eCH-0059 V3.0 §§ 2.4.1–2.4.2, pp. 9–10 | Central information includes life/health, political/personal rights, prevention, rights/duties and information primarily addressing disabled people.  [ech](https://www.ech.ch/sites/default/files/dosvers/hauptdokument/STAN_d_DEF_2020-05-19_eCH-0059_V3.0_Accessibility%20Standard.pdf) | Mandatory for listed central areas; other areas subject to proportionality; additional general-public information is recommended | Relevant public information, not every page indiscriminately | Office responsible for the substantive information | Requires content classification and participation, not just code testing. |
| Accessibility statement and feedback | eCH-0059 V3.0 §§ 2.5–2.6, pp. 10–11; Annex K, p. 21 | Regularly updated, discoverable machine-readable statement; reporting, accessible-format requests and applications for accessible provision.  [ech](https://www.ech.ch/sites/default/files/dosvers/hauptdokument/STAN_d_DEF_2020-05-19_eCH-0059_V3.0_Accessibility%20Standard.pdf) | Normative requirements within applicable eCH scope | Websites and mobile applications | Responsible service-providing administrative unit; bs.ch publishes Webredaktion contact | A statement is self-description, not an audit or conformance certificate. |
| Internal monitoring | eCH-0059 V3.0 § 3.2, pp. 11–12 | Recommends appointing a monitoring function at cantonal/large-organization level.  [ech](https://www.ech.ch/sites/default/files/dosvers/hauptdokument/STAN_d_DEF_2020-05-19_eCH-0059_V3.0_Accessibility%20Standard.pdf) | Recommendation in the standard | Canton/large organizations | No specific Basel technical monitoring office established by this passage | Distinguish this recommendation from the Fachstelle’s legally established monitoring mandate. |

Two scope cautions are important:

- eCH V3.0 § 1.2 contains exclusions and transition rules: online maps, live media during transmission, genuinely uncontrolled third-party content, older content, and legacy websites. Intranet/extranet application is recommended. These standard-level limitations should not be treated as automatically extinguishing broader BRG duties. [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500)
- The bs.ch declaration says the site is only partially compliant, with most PDFs inaccessible and many embedded external contents inaccessible. Its claims about contrast or alternative text are statements by the operator, not independent verification. [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit)

### A3. Federal requirements and applicability boundaries

Federal constitutional non-discrimination, the UN Convention’s accessibility principles, and BehiG form the wider legal context. Federal internet-specific requirements include BehiG Art. 14(2) and BehiV Art. 10; the federal administration also identifies EMBAG Art. 3(4). They must not be presented as if every federal administrative IT directive directly governs Basel’s departments, municipalities or jointly owned institutions. Basel’s direct local anchor is BRG/BRV. [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500)

| Body/service category | Established applicability | What must be checked separately |
|---|---|---|
| Canton | BRG/BRV apply; IT-PM.BS covers cantonal units without separate legal personality.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500) | Specific service mandate, contract, appointed project roles and operational acceptance process |
| City of Basel responsibilities | Municipal affairs of Einwohnergemeinde Basel are handled by cantonal organs; do not invent a separate city digital-accessibility administration.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/170.100) | Which cantonal office owns the particular city service |
| Riehen and Bettingen | Municipalities are expressly covered by BRG; both are included in the action-plan implementation.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500) | Municipal website/application owners, suppliers, budgets and local release procedures |
| Bürgergemeinde Basel | Separate from the city’s Einwohnergemeinde responsibilities; its Zentralen Dienste joined the action plan.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/BaB%20111.100) | Do not expand that participation statement into a verified mandate over every associated institution |
| Public/jointly owned institutions | BRG covers public-task bodies and publicly accessible service providers; eCH describes public-law institutions and state-related enterprises within its adoption framework.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500) | Institution’s legal basis, territorial/joint governance, adopted policies and contracts; public ownership does not prove use of WebBS or IT BS |

## B. Stakeholder matrix

Confidence concerns the documented mandate, not the accessibility quality of the organization’s systems. Pilot assignments below are proposals unless explicitly described as documented.

| Organisation/role | Mandate | Decision rights | Implementation responsibility | Source | Relevance to pilot | Confidence |
|---|---|---|---|---|---|---|
| Regierungsrat; Grosse Rat | Executive priorities/action plan; legislation and political accountability | Government adopts programme; legislature enacts law | Not day-to-day remediation | BRG § 12; RRB P240060, 30 January 2024.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500) | Political umbrella; normally unnecessary as operational sponsor for a small pilot | High |
| Fachstelle Rechte von Menschen mit Behinderungen, Präsidialdepartement | Statutory coordination, monitoring, advice, participation, contact and recommendations | Can recommend; recipient must state whether/how it follows recommendations under BRG § 14 | Supports implementation; no documented general code/release authority | BRG §§ 13–15; official remit updated 10 April 2026.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500) | Proposed policy co-sponsor, standards clarification and participation route | High |
| Begleitgruppe: departmental and municipal representatives | Formal cross-administration coordination | Representation established by BRV § 3 | Connects implementation responsibilities across bodies | BRV § 3, p. 1.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/api/de/versions/5061/pdf_file) | Escalation route for unresolved departmental/municipal handoffs | High mandate; current membership unknown |
| Staatskanzlei, Abteilung Kommunikation; overall bs.ch owner | Central website responsibility | Official directory explicitly identifies Gesamtverantwortlicher www.bs.ch | Central website coordination; operational rights need confirmation | Staatskalender identifies Micha Jäggi as Leiter e-Kommunikationsstrategien / Gesamtverantwortlicher www.bs.ch.  [staatskalender.bs](https://staatskalender.bs.ch/organization/regierung-und-verwaltung/praesidialdepartement/staatskanzlei/abteilung-kommunikation) | Proposed sponsor for a bs.ch pilot and route to shared-component ownership | High |
| Webredaktion | Central editorial contact; accessibility feedback entry point | Editorial coordination; release/budget powers not established | Routes feedback; coordinates with distributed editors and technical provider | Staatskalender organizational placement; bs.ch statement “Allgemeine Adresse und Feedback.”  [staatskalender.bs](https://staatskalender.bs.ch/organization/regierung-und-verwaltung/praesidialdepartement/staatskanzlei/abteilung-kommunikation/webredaktion) | First recipient for bs.ch findings: redaktion@bs.ch | High |
| IT BS, Finanzdepartement | Central IT, digital services, infrastructure and e-government building blocks; ePortal operator | ePortal terms document platform powers; specialist authorities retain service responsibilities | Shared portal/platform/infrastructure; precise application boundaries vary | IT BS remit; ePortal imprint; terms §§ 4–5, 9.  [bs](https://www.bs.ch/fd/itbs) | Essential for ePortal, integration, authentication and technical access | High |
| IT BS PMO / cantonal project-governance roles | IT-PM.BS framework and project governance | Appointed Auftraggeber resources/steers; project manager coordinates; user representative owns solution requirements | Project procurement, SLA checks, requirements and quality management | IT-PM.BS V3.0, § 2.4.1, pp. 10–12.  [bs](https://www.bs.ch/media/21762) | Obtain actual project appointments; do not infer them from job titles | High framework; service appointments unknown |
| KFöB, BVD Generalsekretariat | Procurement coordination, procedure and advice | Supports public purchasers in defining/conducting tenders | Procurement procedure, not automatic technical acceptance | Official remit, updated 13 October 2026.  [bs](https://www.bs.ch/bvd/generalsekretariat/kantonale-fachstelle-fuer-oeffentliche-beschaffungen-kfoeb) | Clarify contractual accessibility clauses, defect liability and commissioning route | High |
| Departmental Fachbehörde / service owner | Substantive service and communication responsibility | ePortal terms distinguish specialist-authority service decisions from platform powers | Service content, business rules and assigned application responsibilities | ePortal terms §§ 4, 9; action-plan responsibilities.  [bs](https://www.bs.ch/fd/itbs/eportal-nutzungsbedingungen) | Must identify the actual owner who can authorize the selected workflow and fund work | High role distinction; selected owner unknown |
| Departmental/dienststelle editors and document authors | Their offices’ published communications | Content changes within delegated editorial responsibilities | bs.ch explicitly assigns structural/semantic findings internally to offices/departments | bs.ch statement, “Erkenntnisse.”  [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit) | Fix headings, content structure, alternatives and documents in the relevant workflow | High division; detailed editorial permissions unknown |
| WebBS technical provider / current maintainers | Code fixes with an external provider are documented | Current contract/change authority not published in inspected material | Shared code defects; exact present supplier/team scope unknown | bs.ch statement; historical implementation evidence below.  [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit) | Identify maintainer before assigning component defects | High existence; current supplier identity unverified |
| Municipal administrations Riehen and Bettingen | Their own municipal services and communications | Local mandates, procurement and budgets require confirmation | Own content/applications and suppliers, not automatically central Webredaktion | BRG § 4; official action-plan launch.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500) | Separate authorization and remediation chain for a municipal pilot | High general mandate |
| Behindertenforum Region Basel; Pro Infirmis Basel-Stadt, Dorneck und Thierstein | Participation/representation; statutory organizational standing | BRV § 2 litigation/complaint standing | No presumed technical acceptance or supplier role | BRV § 2; action-plan launch documents Behindertenforum participation.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/api/de/versions/5061/pdf_file) | Participation and escalation expertise; proposed recruitment partners, not automatic auditors | High |
| Independent accessibility specialists and AT users | Technical and lived-experience validation | No Basel acceptance authority established | Proposed independent testing/retesting | Zugang für alle documents mixed disabled/non-disabled teams and assistive-technology testing.  [access-for-all](https://access-for-all.ch/leistungen/testing/) | Possible commissioned validator; no Basel contract inferred | High capability evidence; no established appointment |
| Ombudsstelle | Independent mediation and review of administrative conduct | Investigates/mediates; not documented as software certification authority | Complaint resolution, not routine coding | Official remit; ePortal terms § 13.  [bs](https://www.bs.ch/ombudsstelle) | Escalation when ordinary service/feedback channels fail | High |
| Competent authorities/courts | Formal enforcement | Decisions under applicable legal procedure | May require remedies; not routine retest operation | BRG §§ 8–11.  [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500) | Rights-enforcement backstop, not first pilot audience | High |

### What the implementation evidence actually establishes

| Evidence | Supported conclusion | Not established |
|---|---|---|
| Official staff publication BS Intern 256, 24 March 2023, article “Erneuerung WebBS” | Liip won the procurement for conception/implementation of the renewed website; its Basel office was responsible for implementation.  [media.bs](https://media.bs.ch/original_file/c69dab1f090c24c93fbed59849e891d6fb653bf4/bs-intern-256.pdf) | Current maintenance contract, current subcontractors, warranty period or 2026 accessibility SLA |
| Liip project account, 28 August 2024 | Historical scope included content strategy, information architecture, design and development; Drupal, Nuxt/Vue and Elasticsearch; work with WebBS in two-week sprints, tested/accepted by the canton.  [liip](https://www.liip.ch/de/blog/ein-neuer-zugang-zu-informationen-der-verwaltung-bs-ch-relaunch) | Independent accessibility audit, present-day release signatory, or continuation of the supplier relationship |
| Same project account | A design system was made available as design guidance and code for other offices.  [liip](https://www.liip.ch/de/blog/ein-neuer-zugang-zu-informationen-der-verwaltung-bs-ch-relaunch) | Which services currently reuse it, who maintains every shared component, or mandatory adoption |
| Current bs.ch accessibility statement | Code findings go to a provider; structural/semantic findings go internally to offices/departments; regular reviews are claimed; public feedback goes to Webredaktion.  [bs](https://www.bs.ch/erklaerung-zur-barrierefreiheit) | Review reports, reviewer identity, ticket queue, prioritization rules, response SLA, budget allocation, closure evidence or mandatory retesting |
| ePortal terms, updated 21 July 2026 | Technical/platform feedback: ePortal@bs.ch. Substantive service questions: responsible Fachbehörde. Login redirects to federal AGOV.  [bs](https://www.bs.ch/fd/itbs/eportal-nutzungsbedingungen) | One end-to-end owner across all these systems, accessibility-specific escalation SLA, present application suppliers |
| IT-PM.BS project framework | Project sponsors provide resources; project managers oversee procurement/SLA compliance; user representatives manage solution requirements.  [bs](https://www.bs.ch/media/21762) | Which current budget pays for a particular operational defect, whether supplier warranty applies, or who can waive a release blocker |

Consequently, “who pays?” and “who accepts the retest?” remain service-and-contract questions. The project framework identifies roles that must be located; it does not identify the current account holder for every live system.

## C. Compact responsibility flow

### Documented flow—and unresolved handoffs

```text
BRG §§ 4–7 + BRV § 1
  → applicable eCH requirements / service-specific policy and contract
  → responsible service-providing body
      ├─ bs.ch:
      │    Staatskanzlei / overall website responsibility
      │      ↔ departmental service and editorial responsibility
      │    → code findings: external provider
      │    → structural/semantic findings: departments / Dienststellen
      │
      ├─ ePortal:
      │    IT BS: platform / technical support
      │      ↔ Fachbehörde: substantive service
      │      ↔ AGOV: separate federal authentication dependency
      │
      ├─ specialist application / external embedded platform:
      │    owning body → application/platform maintainer [identify]
      │
      └─ Riehen / Bettingen / separate institution:
           own responsible body → its implementation arrangements [identify]

  → reviews / validation
       bs.ch says regular reviews occur
       reviewer, method, scope and release gate [UNKNOWN]
  → remediation assignment
       bs.ch code/content split documented
       ticket ownership, priority, cost and deadlines [UNKNOWN]
  → retest / closure / release
       named acceptor, evidence requirements and regression process [UNKNOWN]
```

The legal chain is established in BRG/BRV; the bs.ch code/content split is publicly described; the ePortal platform/service split and AGOV dependency are explicit in its terms. The unknown boxes are not documented end-to-end procedures. [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500)

### Proposed pilot collaboration model—not an existing Basel RACI

Choose one bounded user journey: for example, an information page → form → submission/confirmation → generated document. Include any authentication or external-platform step in the scope inventory; do not call a journey conformant after testing only its bs.ch entry page. eCH § 2.2 explicitly requires complete-process conformance. [ech](https://www.ech.ch/sites/default/files/dosvers/hauptdokument/STAN_d_DEF_2020-05-19_eCH-0059_V3.0_Accessibility%20Standard.pdf)

| Pilot function | Proposed assignment |
|---|---|
| Operational sponsor | Owner of the selected service, jointly with the relevant central platform owner where shared code is involved |
| Policy co-sponsor | Fachstelle, to connect the pilot to the action plan and clarify requirements/participation |
| Access authorization | Actual service/system owner, with platform/security approval where needed; provide authorized test accounts and safe test data |
| Technical context | Platform/application maintainer plus departmental service expert; document authoring/generation owner if PDFs are involved |
| Findings validation | Independent accessibility specialist plus paid AT-user participation; add cognitive, hearing or other relevant participation according to the journey |
| Fix implementation | Shared-component maintainer for code; departmental editors/document authors for content; specialist supplier for application defects |
| Retest acceptance | Named service-side acceptor, informed by independent retest evidence; platform owner additionally accepts shared-component changes |
| First results recipients | Service owner and relevant platform owner together, with Fachstelle and validator; then assigned maintainers—not a public supplier-ranking exercise |

Use the documented WCAG 2.1 AA/eCH V3.0 baseline for the requirements ledger. Any additional WCAG 2.2 tests should be separately labelled as an agreed pilot extension, not retrospectively portrayed as Basel’s established compulsory baseline. The PDF edition must be agreed explicitly before PDF acceptance.

## D. The three most appropriate first conversations

### 1. Fachstelle Rechte von Menschen mit Behinderungen

Why: it has the statutory coordination/advice/monitoring remit, helped develop the action plan, and connects departments, municipalities and disability participation. It can establish whether the pilot fills an existing workstream and identify the relevant Begleitgruppe representative. It should not be presumed able to authorize production-system access. Contact route: behindertenrechte@bs.ch. [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500)

### 2. Staatskanzlei / overall bs.ch responsibility and Webredaktion

Why: for a bs.ch-based pilot, this is the documented central website responsibility and feedback route. Ask it to identify the selected departmental owner, current shared-code maintainer, actual review evidence and release authority. The official directory currently establishes Micha Jäggi’s overall www.bs.ch remit; redaktion@bs.ch is the published accessibility-feedback route. [staatskalender.bs](https://staatskalender.bs.ch/organization/regierung-und-verwaltung/praesidialdepartement/staatskanzlei/abteilung-kommunikation)

### 3. Selected Fachbehörde together with the relevant platform owner

Why: this is where access permission, real user journeys, budget and implementation authority must meet. For an ePortal journey, include IT BS/ePortal support and the responsible Fachbehörde in the same conversation. For a municipal journey, substitute the municipality’s service/platform owners; for a separate institution, use its own governance. The ePortal terms explicitly distinguish technical support from substantive-service responsibility. [gesetzessammlung.bs](https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/140.500)

### Five concrete responsibility questions

1. Who is accountable for this exact end-to-end journey? Name the substantive service owner, platform owner, content owner and any external authentication/payment/application owner; who can authorize the proposed tests?

2. Which requirements are binding here, and where are they recorded? Request the applicable directive, procurement specification, signed contract/SLA and acceptance checklist—including eCH/WCAG versions, the exact PDF/UA edition, and any documented exceptions.

3. Who receives, classifies and funds a finding? Ask for the real ticket route, code-versus-content triage, shared-component escalation, priority rules, remediation budget and distinction between warranty work and chargeable change.

4. Who validates and accepts? Request the latest relevant audit/review, tested scope and AT/browser combinations; identify who can block a release, accept residual risk and sign off a retest.

5. How does a user report become verified closure? Walk through one anonymized past issue from feedback inbox to assigned owner, fix, regression test, user response and accessibility-statement update.

The pilot’s initial deliverable should be a jointly confirmed responsibility record with these five questions answered—not an inferred RACI assembled from organizational titles.