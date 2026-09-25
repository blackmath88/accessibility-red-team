# Open-source references and dependencies

Accessibility Red Team intentionally reuses mature open-source components and architectural ideas.

## Runtime dependencies

- **Playwright** — browser automation; Apache-2.0.
- **axe-core / @axe-core/playwright** — accessibility analysis; MPL-2.0.
- **Zod** — runtime schemas and validation; MIT.
- **yaml** — YAML parsing; ISC.

Dependencies remain governed by their upstream licenses.

## Architectural references

We borrow patterns, terminology and design lessons rather than vendoring their implementations:

- **public-ai-challenge** — bounded Scout/recon, typed handoffs and evidence/provenance philosophy.
- **ProjectDiscovery Katana** — scoped crawling and budgets.
- **ProjectDiscovery Nuclei** — versioned rule/template engine and profiles.
- **OWASP ZAP** — passive/active separation and risk/confidence distinction.
- **Pa11y / Pa11y CI** — browser journeys and reporter separation.

Where upstream source code is later copied or materially adapted, the copied file must retain the applicable copyright/license notice and the repository's attribution record must be updated.
