# Zürich + Solothurn pilot sample frame

Date: 2026-09-29

## Sampling logic

The 24-site cohort is purposive and stratified. It is designed to test the observatory, not estimate a population prevalence rate and not rank municipalities.

Zürich provides a particularly wide scale distribution: the canton has 160 political municipalities and describes strong variation in population, area, demographics and finances. Cantonal reporting notes that roughly half the municipalities have fewer than 5,000 residents while Zürich city alone exceeds 430,000.

Solothurn provides a smaller municipal ecosystem with regional centres, agglomeration municipalities and rural/peripheral districts. Current canton/BFS data are the authority for later enrichment of population and typology fields.

Selection dimensions:
1. municipality scale;
2. urbanity / regional role;
3. likely civic-service complexity;
4. observed web implementation;
5. geographic/administrative context.

Website technology is intentionally not treated as known ground truth yet. It should be captured by the pilot as an observed/enriched attribute. This avoids silently turning a vendor inference into sampling fact.

## Wave 1

Wave 1 is an eight-site gate:

### Zürich
- Zürich — major city / complex service surface
- Uster — regional city / rich service catalogue
- Bauma — rural municipality
- Volken — very small municipality with prior engineering evidence

### Solothurn
- Solothurn — cantonal capital / complex service surface
- Zuchwil — large agglomeration municipality
- Messen — rural Bucheggberg municipality
- Welschenrohr-Gänsbrunnen — small Thal municipality / contrasting implementation

This wave deliberately avoids simply taking the largest municipalities.

## Gate before Wave 2

Review Wave 1 before running the remaining 16 sites.

Check:
- host throttling / 429 / Retry-After behavior;
- surface discovery stability;
- evidence integrity;
- duplicate/noise burden;
- human-review sample;
- deterministic-vs-Morrow comparison on frozen evidence;
- observed technology/provider clustering.

Only proceed to Wave 2 if the execution remains host-safe and the result-quality sample is useful enough to justify more traffic.

## Source frame

Authoritative enrichment should use:
- Kanton Zürich municipality/statistics sources;
- Kanton Solothurn statistics sources;
- BFS municipality register and municipality typology.

Canonical URLs in the cohort were independently checked as reachable during sample-frame preparation. URLs remain operational inputs, not claims about legal responsibility or accessibility conformance.
