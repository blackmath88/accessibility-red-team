# Basel-region municipality field validation

This cohort exists to test the observatory against real municipal websites with different structures.

It is **not** a conformance comparison and deliberately applies no legal/jurisdiction profile.

Sites were selected as a small varied field set:

- Riehen (BS)
- Allschwil (BL)
- Binningen (BL)

For each root page the workflow runs:

1. deterministic scan;
2. coverage manifest;
3. safe behavioral journeys;
4. compact field summary;
5. retained raw artifacts.

The purpose is to find scanner assumptions that fail on real sites before expanding the corpus.

Do not rank municipalities from these results. Differences in page structure, sampled surfaces, dynamic behavior and observability make raw counts non-comparable as accessibility scores.
