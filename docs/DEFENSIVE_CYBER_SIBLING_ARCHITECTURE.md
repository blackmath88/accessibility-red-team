# Sibling architecture — defensive cyber observatory

Status: future separate repository concept.

The learning architecture is intentionally reusable beyond accessibility, but cybersecurity requires a stricter authorization and safety boundary.

## Shared architecture

```
broad passive/safe reconnaissance
        ↓
system fingerprinting
        ↓
signals / anomalies / shared architecture
        ↓
authorized bounded verification
        ↓
validated defensive finding
        ↓
compile repeatable detector
        ↓
deterministic / local semantic capability
        ↺
```

Roles remain:
- deterministic software for known/repeatable checks;
- local model for bounded semantic decisions;
- frontier model for selected open-ended defensive research;
- human authorization/review for scope and consequential conclusions.

## Default boundary for public targets

Without explicit target authorization, the sibling system stays at **passive/public-surface observation and non-invasive safe verification**.

Allowed conceptual categories:
- public HTTP/TLS/DNS/security-header posture;
- publicly exposed technology metadata;
- public asset/dependency/version signals;
- certificate/configuration observations;
- safe content/configuration checks;
- public policy/security-contact discovery;
- defensive correlation of known public metadata.

Not part of the default system:
- exploit attempts;
- credential guessing/spraying;
- authentication bypass;
- vulnerability exploitation;
- destructive state changes;
- persistence;
- stealth/evasion;
- denial of service or load testing;
- malware/payload delivery;
- lateral movement;
- scanning behavior outside explicitly defined safe rate/scope.

A deeper active pentest mode belongs behind explicit authorization, target/scope records and separate execution policy. It must never be inferred from “red team” wording.

## Why keep it separate

Accessibility and cybersecurity can share architectural primitives:
- population/cohort control plane;
- evidence/provenance;
- fingerprinting;
- target selection;
- deterministic probe catalogue;
- semantic compiler;
- local/frontier/human learning loop;
- case/report UI.

They should not share execution policy or authorization assumptions.

The cyber sibling should therefore be a new repository that imports/copies the architectural pattern, not a new probe family hidden inside accessibility-red-team.
