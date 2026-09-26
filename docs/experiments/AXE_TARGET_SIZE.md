# Experiment — axe 4.13 `target-size`

Status: controlled regression experiment

## Question

Does the pinned axe-core 4.13 configuration used by this repository omit WCAG 2.2 `target-size` by default, and does explicit enablement make the rule observable?

## Why this is an experiment

The research report correctly raised a WCAG 2.2 coverage concern, but a secondary-source claim is not enough to change production scanner semantics. The repository therefore proves the behavior against the exact pinned engine version.

## Fixture

A local, synthetic HTML page contains an intentionally tiny link target. No public website is contacted.

## Expected

1. A default `AxeBuilder.analyze()` result contains no `target-size` result in any outcome bucket.
2. `.withRules(["target-size"])` returns a `target-size` result.
3. The returned rule carries `wcag258` and `wcag22aa` tags.
4. The fixture produces node evidence.

## Decision gate

Passing this experiment proves **engine/configuration behavior**, not that the rule is ready for default production use.

Promotion still requires:

- false-positive sampling on representative interfaces;
- documenting whether the result is violation vs incomplete and why;
- preserving the Swiss authority distinction (federal WCAG 2.1 AA vs profiles that adopt 2.2);
- recording the enabled rule set in the run coverage manifest.

Until then the production scanner remains conservative.
