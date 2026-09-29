# Solothurn population cohort — 2026

## Scope

Prepare the **entire current Canton Solothurn municipal population** as an Observatory cohort. This file is preparation only: it does not authorize or enqueue assessments.

The canton reports **104 Einwohner-/Einheitsgemeinden as of 01.01.2026**. The public municipality web directory still exposes Halten and Oekingen, but the canton records their merger with Kriegstetten effective 01.01.2026. Therefore those two superseded entities are excluded from this population cohort.

Kammersrohr is retained as a municipality but the canton explicitly states that it has **no website**. It is therefore a valid `NO_DIGITAL_PROPERTY` population outcome and must not be assigned a guessed URL.

## Sources

- Kanton Solothurn, Einwohnergemeinden directory: https://so.ch/allgemeine-informationen/einwohnergemeinden/
- Kanton Solothurn, municipal-stock statistics (104 current municipalities at 01.01.2026): https://so.ch/verwaltung/volkswirtschaftsdepartement/amt-fuer-gemeinden/gemeindeorganisation/gemeindezusammenarbeit-fusion/statistik/
- BFS official municipality register, state 01.01.2026: https://www.agvchapp.bfs.admin.ch/de

The URLs in `so-2026-municipalities.csv` come from the canton directory, not search-engine inference.

## Population accounting

- current municipalities: **104**
- canton-listed municipal websites: **103**
- explicitly no municipal website: **1 (Kammersrohr)**
- superseded directory entries excluded: **Halten, Oekingen**

## Execution plan

Do not jump from Wave 1 to 103 websites in one release.

### Gate A — current Wave 1
Finish and analyze the existing ZH/SO Wave 1.

### Gate B — Solothurn expansion 10
Add ten not-yet-run Solothurn municipalities, distributed across districts/site implementations. Verify host safety, result projection, artifact storage and operator workload.

### Gate C — Solothurn expansion 25
Add another 25 only if Gate B does not reveal systemic execution/evidence-quality problems.

### Gate D — remaining web population
Queue the remaining eligible Solothurn municipal websites in bounded independent runs. Kammersrohr remains represented but unscannable until an authoritative digital property exists.

At every gate, a municipality remains an independent case/run. A canton cohort is orchestration metadata, never a coupled batch job.

## Before population execution

Enrich/verify:
- BFS municipality number;
- district;
- canonical URL redirect/final host;
- observed technology/provider;
- duplicate/shared-host detection;
- robots/network-policy compatibility.

Do not treat CMS/provider inference as authoritative until observed and recorded.

## Research use

Whole-canton execution should answer population-level questions about:
- operational coverage and failure modes;
- recurring deterministic accessibility findings;
- behavioral evidence;
- shared technology/component patterns;
- human-review burden;
- ambiguity distribution.

It must not be turned into a municipality league table or accessibility score.
