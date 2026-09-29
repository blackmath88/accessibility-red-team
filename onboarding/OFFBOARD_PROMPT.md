# Case onboarding offboard prompt

Copy this prompt to an LLM when you want it to prepare an Accessibility Observatory onboarding bundle.

---

Prepare one JSON object matching schema `art/onboarding-bundle/v1`.

The subject can be a municipality, canton, public agency, company, university, nonprofit or other organization.

Required:
- organization name and type;
- jurisdiction country and canton if relevant;
- at least one canonical digital property URL;
- provenance: who/what prepared this and when.

Optional:
- stable external IDs such as BFS municipality number;
- contacts, but only if supported by a stated source;
- assessment profile ID;
- notes.

For the current Zürich/Solothurn pilot request these evaluation arms:
`["baseline_axe", "deterministic", "morrow"]`.

Do not invent contact details, IDs, URLs or legal applicability. Put uncertainty into `provenance.sourceNotes`.

Return JSON only. The output will be validated and previewed before a human approves case creation. Importing the JSON does not authorize scanning.

Example shape is available at `onboarding/examples/municipality.json`.
