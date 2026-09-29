# Evaluation Harness v1

## Question

Does the observatory produce accessibility evidence that is more useful than a plain axe baseline?

The evaluation deliberately does **not** rank municipalities and does not infer conformance from finding counts.

## Cohort

Eight municipality sites already used by the repository's Basel-region and Zürich field/pilot work. The cohort is intentionally small enough for human validation.

## Comparison

For each site retain separately:

1. **baseline axe** — root-page default axe result;
2. **observatory static** — bounded surfaces, normalized evidence, incomplete states and provenance;
3. **observatory behavioral** — safe journeys;
4. **human review** — sampled finding validation.

Do not collapse these layers into one score.

## Human validation labels

Each sampled finding receives:

- `confirmed`
- `false_positive`
- `uncertain`
- `duplicate`

and actionability:

- `actionable`
- `needs_context`
- `not_actionable`

A reviewer note should say what evidence was checked.

## Metrics

Report:
- reviewed sample size;
- confirmed / false-positive / uncertain counts;
- precision among decided findings only;
- actionable share;
- behavioral findings beyond the baseline;
- static evidence beyond root-page baseline;
- incomplete/human-review burden.

Never report an accessibility quality score for a municipality.

## Success criterion

The project earns its complexity only if the observatory provides reproducible behavioral or contextual evidence beyond plain axe **and** the sampled evidence is sufficiently accurate/actionable for a recipient to act on.

The first run is exploratory. Thresholds for promotion should be chosen after observing the distribution, not invented in advance.
