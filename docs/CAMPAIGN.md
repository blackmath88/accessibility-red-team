# Campaign and Outreach Strategy

Status: working campaign architecture  
Project: Accessibility Red Team  
Scope: communication with Swiss public-sector organisations after an evidence-backed assessment

## 1. Purpose

The campaign should turn observatory findings into useful, low-friction improvement opportunities.

The goal is not to shame, rank, certify or pressure municipalities.

The intended posture is:

> We observed something reproducibly on your public digital service, and we are sharing the evidence and practical help in case it is useful.

The campaign should scale to many organisations with very little manual communication while preserving accuracy, evidence, respectful tone, practical usefulness, uncertainty, provenance, feedback and longitudinal learning.

The outreach layer is part of the product, not a separate sales campaign.

## 2. Campaign principles

### Helpful, not demanding

Communication should be neutral, specific, concise, non-accusatory, evidence-backed and useful without requiring a meeting.

Avoid language such as:

- "you are non-compliant";
- "you failed WCAG";
- "you need to fix";
- "we found violations" when the evidence does not support that claim;
- legal claims beyond the sourced jurisdiction profile.

Prefer:

- "we observed";
- "our checks identified";
- "this may affect";
- "here is the evidence";
- "here is a practical way to improve it";
- "we hope this is useful."

### No forced sales funnel

The default call to action is:

> View the report / improvement guidance.

Do not require booking a call, signing up, responding, buying a service or creating an account.

Feedback should be welcomed, not demanded.

### Say only what the evidence supports

The campaign must inherit the observatory's epistemic discipline.

Do not turn a scanner observation into:

- full WCAG conformance claims;
- certification;
- legal conclusions;
- municipality-level applicability unless explicitly sourced;
- claims about user harm not supported by evidence.

The current coordination state explicitly requires municipality cohorts to use a research benchmark profile until binding municipal applicability is explicitly sourced.

## 3. Communication architecture

The campaign has three complementary public surfaces:

    1. ORGANISATION REPORT
       specific observations for one organisation

    2. AFFECTED PUBLIC PAGES
       direct links to the exact pages/surfaces where observations were made

    3. IMPROVEMENT CATALOGUE
       reusable public guidance explaining the issue and how to improve it

An outreach message should connect all three:

    observation
      → specific public page
      → evidence
      → why it matters
      → practical improvement
      → catalogue module

The recipient should never need to reverse-engineer where a finding came from.

## 4. Recipient archetypes

Keep the number of communication variants small.

### 4.1 IT / Web

Primary interest:

- affected page/component;
- reproducible evidence;
- technical remediation;
- testing instructions;
- implementation resources.

Message emphasis:

> Here is what we observed, exactly where we observed it, and how it can be checked or improved.

### 4.2 Inclusion / Accessibility / Diversity

Primary interest:

- user impact;
- recurring accessibility patterns;
- organisational relevance;
- practical improvement resources;
- change over time.

Message emphasis:

> Here are evidence-backed observations that may affect access to your public digital services, together with practical guidance.

### 4.3 General administration

Use when a specialised contact cannot be identified.

Primary interest:

- concise summary;
- correct internal routing;
- report link;
- no technical overload.

Message emphasis:

> We are sharing a small accessibility assessment in case it is useful; please forward it internally if another team owns the website.

### 4.4 Rescan / change follow-up

Use only when something materially changed, for example:

- an observed issue was resolved;
- a new issue appeared;
- a previously incomplete/unknown result became conclusive;
- the organisation told us they changed something.

Do not send generic "just following up" messages.

## 5. Default outreach structure

A scalable outreach message should contain:

1. one-sentence explanation of the observatory;
2. link to the organisation-specific report;
3. one to three useful observations;
4. direct link(s) to the exact affected public page(s);
5. corresponding improvement catalogue link(s);
6. scope/limitations statement;
7. lightweight feedback invitation.

Do not overload the email with the full technical report. The email is a doorway into the evidence.

## 6. Example email — IT / Web

Subject: Accessibility observations for your website

Hello

We are building an independent observatory looking at the accessibility of Swiss public-sector websites.

We recently assessed selected pages of your website using reproducible automated and browser-based checks and wanted to share the result in case it is useful:

**[View your accessibility report]**

The report shows the observations we could verify, the specific pages and components where they occurred, the supporting evidence, and practical guidance for improvement.

For example:

- **[Observation]** — [specific affected page] → [improvement guide]
- **[Observation]** — [specific affected page] → [improvement guide]
- **[Observation]** — [specific affected page] → [improvement guide]

This is not a certification or a complete WCAG audit, and there is no obligation attached to this email.

For our own learning, one thing would be especially valuable: **if you change something based on one of these observations or recommendations, we would be very interested to hear about it.** This helps us understand which findings and resources are actually useful in practice and improve the observatory over time.

If anything in the report looks incorrect or does not fit your context, that feedback is equally welcome.

Best regards  
Achim Imboden

## 7. Example email — Inclusion / Accessibility

Subject: Accessibility observations for your digital services

Hello

We are building an independent observatory for the accessibility of Swiss public-sector websites.

Your organisation was included in one of our assessments, and we wanted to share the result in case it is useful:

**[View your accessibility report]**

For each observation, the report links to the specific public page where we found it and provides practical guidance, examples and resources for improving it.

The aim is not to provide a formal accessibility certification or complete WCAG audit, but to make a small number of concrete, evidence-backed improvements easier to identify and act on.

There is no request attached to this email.

For our own learning, we would especially appreciate hearing from you **if you change something based on one of the observations or recommendations**. That helps us understand whether the observatory is producing useful improvements in practice.

Likewise, if something we reported appears incorrect or does not fit your context, we would be grateful for that feedback.

Best regards  
Achim Imboden

## 8. Finding-to-guidance contract

A finding should not end at a WCAG code or scanner message.

For outreach-ready findings, the ideal chain is:

    finding
    → exact affected page/surface
    → evidence
    → user impact
    → remediation module
    → resource module
    → implementation hint
    → self-test

Example:

    Missing form label

    Observed on:
    → https://example.ch/umzug-melden
    → https://example.ch/baugesuch

    Evidence:
    Input "E-Mail" has no programmatically associated label.

    Why this matters:
    A screen-reader user may not know what information the field expects.

    How to improve:
    → practical fix
    → before/after example
    → how to test manually

    Learn more:
    → /catalogue/forms/labels

Direct links to public pages are important. They make the message concrete and immediately actionable.

## 9. Public improvement catalogue

The catalogue should be a public, reusable knowledge surface designed for people improving public websites, not primarily for standards specialists.

Possible information architecture:

    /catalogue
      /keyboard
        /visible-focus
        /skip-links
        /menus
      /forms
        /labels
        /errors
        /instructions
      /images
        /alt-text
      /structure
        /headings
        /landmarks
      /contrast
      /dialogs
      /language

The exact taxonomy should be derived from validated catalogue content rather than fixed prematurely.

### Each catalogue module should contain

#### What we observe
Plain-language description of the pattern detected by the observatory.

#### Who this can affect
Concrete user impact without overstating what the automated evidence proves.

#### How to improve it
Small, practical instructions.

#### Example
Before/after HTML, UI or implementation example where useful.

#### How to check it yourself
A short manual verification procedure.

#### Automated check
What the observatory actually measured.

#### Limitations
What the automated check cannot establish.

#### References
Relevant authoritative accessibility guidance and standards references.

The limitations section is mandatory. The catalogue must preserve the same evidence discipline as the scanner.

## 10. Catalogue as stable knowledge layer

The catalogue should not be regenerated independently for every organisation.

Instead:

    finding class
        ↓
    stable catalogue ID
        ↓
    shared guidance module
        ↓
    used by:
      - organisation report
      - outreach email
      - dashboard
      - machine-readable API
      - future assistant interfaces

Example mapping:

    finding: axe.label
    catalogue: forms.missing-label

This makes outreach scalable and keeps remediation guidance consistent.

AI should not freely invent remediation advice for every email when a validated catalogue module already exists.

## 11. Suggested catalogue data contract

Illustrative only:

~~~json
{
  "id": "forms.missing-label",
  "version": "1",
  "title": "Form fields need accessible labels",
  "findingMappings": ["axe.label"],
  "impact": {
    "summary": "A user may not know what information a form field expects.",
    "confidence": "supported"
  },
  "remediation": {
    "summary": "Associate the visible field label with the form control.",
    "implementationExamples": []
  },
  "selfCheck": [],
  "limitations": [],
  "references": []
}
~~~

Catalogue content must follow the project's validation/promotion rules before it becomes trusted production guidance.

## 12. Report visibility

Initial recommendation:

- the catalogue should be openly public and indexable;
- organisation-specific reports should be directly shareable with recipients;
- do not initially design the product as a public municipality ranking/shaming site.

The objective is improvement, not public league tables.

Public report visibility can be revisited later with explicit product and governance decisions.

## 13. Feedback loop

The feedback request should serve the observatory's learning goals.

Avoid generic:

> Was this useful?

Prefer:

> If you change something based on one of these observations or recommendations, we would be very interested to hear about it.

Two kinds of feedback are especially valuable.

### 13.1 Correction feedback

The organisation says:

- finding is wrong;
- page context changes interpretation;
- observed component is intentionally different;
- guidance does not apply;
- a source/profile is incorrect.

This should feed validation and catalogue improvement.

### 13.2 Change feedback

The organisation says:

- "we fixed this";
- "we changed the component";
- "we updated the template";
- "your observation led us to change X."

This is impact evidence.

Do not silently equate a resolved scan finding with confirmed campaign impact.

Keep the distinction:

    OBSERVED RESOLUTION
    The scanner later sees that the finding disappeared.

    CONFIRMED IMPACT
    The organisation explicitly says it changed something because of the observation/guidance.

Both are valuable, but they mean different things.

## 14. WATCH integration

The campaign becomes more useful when connected to longitudinal scanning.

Example lifecycle:

    observation shared
          ↓
    organisation receives guidance
          ↓
    site changes
          ↓
    next scan
          ↓
    WATCH = RESOLVED

A meaningful follow-up can then say:

> On our latest scan, an observation we previously shared no longer appears.

That is preferable to generic reminder email.

Potential aggregate learning metrics:

- observations shared;
- organisations contacted;
- corrections received;
- changes confirmed by organisations;
- observed resolutions;
- time-to-observed-resolution;
- catalogue modules associated with resolutions.

Do not infer causality from observed resolution alone.

## 15. Automation model

The intended campaign should require little manual drafting.

Possible flow:

    verified assessment
          ↓
    recipient role
          ↓
    outreach eligibility gate
          ↓
    select 1–3 useful findings
          ↓
    attach exact affected public-page URLs
          ↓
    map findings → catalogue modules
          ↓
    deterministic email template
          ↓
    optional bounded semantic personalisation
          ↓
    human/automation send policy
          ↓
    feedback + WATCH

The email body should be mostly deterministic.

Possible AI use is limited to bounded operations such as:

- choose the most useful one to three already-verified observations;
- adapt phrasing to recipient role;
- summarize verified evidence within a strict schema.

AI must not:

- invent findings;
- invent remediation;
- invent affected URLs;
- make legal claims;
- decide that a municipality is non-compliant;
- generate unsupported impact claims.

## 16. Outreach eligibility gate

Not every scan result should produce communication.

Before outreach, require:

- findings are verified according to project rules;
- affected URL is still valid/current enough to share;
- evidence can be shown;
- catalogue guidance exists and is trusted, or the finding is otherwise useful without it;
- wording does not overstate jurisdiction/legal applicability;
- no known contradictory evidence;
- the finding is meaningful enough to warrant contact.

Journey-based observations must respect existing project gates. Repeated journey gaps such as skip-link behavior should not enter outreach until deterministic fixture validation and promotion requirements are met.

## 17. Campaign data model

A campaign record could eventually retain:

~~~json
{
  "organisationId": "ch-example",
  "assessmentId": "run-...",
  "recipientRole": "it",
  "recipientSource": "public-contact",
  "sentAt": "...",
  "findingRefs": [
    {
      "findingId": "...",
      "pageUrl": "https://example.ch/service",
      "catalogueId": "forms.missing-label"
    }
  ],
  "feedback": [],
  "laterObservedResolution": null,
  "confirmedImpact": null
}
~~~

Do not treat this illustrative schema as implementation authority until the campaign runtime is actually designed.

## 18. Public website positioning

The public-facing catalogue/homepage should lead with usefulness rather than assessment.

Possible positioning:

> **Small accessibility improvements for public digital services.**

Supporting line:

> Evidence-backed observations, practical fixes and reusable guidance for Swiss public organisations.

Primary navigation could remain simple:

- Explore the catalogue
- How the observatory works
- Methodology

The site should avoid the feel of:

- a compliance scoreboard;
- a hall of shame;
- a generic AI chatbot;
- a consultancy sales funnel.

## 19. Campaign success

The campaign should not optimize primarily for number of emails sent, response rate or meeting bookings.

More meaningful signals are:

- recipients can understand the observation;
- recipients can find the affected page immediately;
- guidance is actionable;
- corrections improve the observatory;
- organisations report making changes;
- WATCH later observes genuine resolution;
- catalogue modules become more accurate through real use.

The strongest long-term story is:

    evidence
    → practical guidance
    → organisational action
    → observed improvement
    → better shared knowledge

## 20. Open design questions

Before automation is enabled at scale, decide:

1. Which recipient discovery method is acceptable and maintainable?
2. Do IT and inclusion contacts receive the same report URL or different report views?
3. What minimum finding quality is required before outreach?
4. Which catalogue modules are trusted enough for public guidance?
5. Should first-wave sending require human review?
6. How should corrections be submitted and represented?
7. How should confirmed impact be captured without creating administrative burden?
8. What privacy/retention policy applies to campaign recipient data?
9. Which follow-ups are useful enough to automate?
10. When, if ever, should organisation-specific reports become publicly discoverable?

## 21. Core campaign rule

> **Do not merely tell an organisation that something is wrong. Show exactly what was observed, where it was observed, why it may matter, how it can be improved, and how they can tell us if the observation helped.**
