# Milestone — First Nebuchadnezzar deterministic pilot

Date: 2026-09-29

## Status

**Execution architecture: validated.**
**Evidence pipeline: validated.**
**Provenance and integrity: validated.**
**Graceful partial-failure behavior: validated.**
**Accessibility-result quality: not yet validated.**

This milestone is not proof that the observatory produces accurate accessibility judgments. It proves that the deterministic system can execute a bounded real-site cohort reproducibly, retain evidence, survive a site-level failure, and return verifiable artifacts.

## Frozen run

Run: `deterministic-pilot-20260929T100045Z`
Execution host: Nebuchadnezzar

- repository SHA: `7ea6f41f72141e725f404322649407d6b3d9f29f`
- runner SHA-256: `29b94b6c238ecb19cce0c5b35fc32bb2603c1a7f4d92499560efc09037f069e1`
- cohort SHA-256: `cef211533cf6b002547aaaea6e17f8cccb8b5514f6f6b65d7f4c49584bc6d640`
- clean detached checkout; `gitDirty: false`
- Node `v26.8.1`; npm `11.19.0`
- Playwright `1.63.0`; Chromium `153.0.8010.12`
- axe-core / axe-playwright `4.13.0`
- AI/Morrow calls: `0`

All build/tests passed locally and on Nebuchadnezzar.

## Cohort outcome

| Municipality | Status | Baseline violations | Observatory surfaces | Static findings | Behavioral results |
| --- | --- | ---: | ---: | ---: | ---: |
| Riehen | PASS | 4 | 2 | 5 | 8 |
| Allschwil | PASS | 6 | 2 | 8 | 8 |
| Binningen | PARTIAL | 4 | — | — | — |
| Volken | PASS | 3 | 2 | 5 | 8 |
| Maschwanden | PASS | 4 | 2 | 8 | 8 |

Counts are captured evidence, not accessibility scores or conformance determinations.

## What this established

### Observatory execution goes beyond a root-page axe baseline

The four complete sites consistently produced additional bounded surfaces and behavioral results. This proves the execution architecture is materially more than a wrapper around one root-page `axe.run()`. It does not yet prove the additional evidence is accurate or useful.

### Site-level failure isolation works

Binningen completed its baseline but a safe-journey request received HTTP 429. The runner retained partial evidence, marked the site PARTIAL, did not immediately retry, did not abort the cohort, and allowed remaining sites to continue. This is desirable behavior.

### Host-safe pacing is the next scaling requirement

A five-second inter-site delay does not govern multiple requests against one host during SCOUT/journeys. Before scaling, implement or validate per-host pacing, bounded backoff for 429/503, Retry-After handling, per-host concurrency/request budgets, and recording of throttling decisions.

The correct response to a 429 is not to maximize completion rate. It is to reduce load and preserve uncertainty.

### Provenance is strong enough for a paired experiment

The deterministic arm is reproducible enough to become the frozen baseline for the Morrow experiment. Do not rescan successful sites merely to generate Morrow inputs. Arm C should consume this exact evidence. Keep Binningen PARTIAL rather than repairing the dataset after the fact.

## What remains unknown

The pilot does not yet answer whether findings are true positives, meaningful, duplicate/noisy, actionable by municipal teams, or worth the observatory's added complexity. It also does not establish whether Morrow reduces justified human-review burden or merely produces better prose.

## Next experiment — deterministic vs Morrow

Use identical frozen evidence and compare deterministic-only, deterministic + bounded Morrow, and blinded human validation.

Primary outcomes:
- confirmed / false-positive / uncertain;
- actionable / needs-context / not-actionable;
- human-review burden;
- semantic decisions staying inside supplied evidence and decision bounds.

Morrow is useful only if it improves decision quality/actionability or reduces justified human-review burden without increasing unsupported claims. No useful Morrow improvement is a valid result.

## Artifact integrity

The retrieved run contains 107 files / approximately 36 MB. All 106 files listed by the integrity manifest verified successfully; the 107th file is the manifest itself. The remote copy remains on Nebuchadnezzar and the verified workstation copy is the analysis source.

## Milestone decision

**Proceed to the Morrow arm and human-validation phase.**

Do not yet claim accessibility-quality validity or expand to the full Zürich/Solothurn population until result quality and host-safe execution have been evaluated.
