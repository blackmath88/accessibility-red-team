# Adaptive track: evidence preservation record

Date: 2026-10-24 · Scope: S0 of `ADAPTIVE_ASSESSMENT_BUILD_PLAN.md`. No evidence is committed to this repository.

## Preserved

Two GitHub Actions artifacts cited by the PR #40 review were copied to the maintainer workstation archive on 2026-10-24, before their 2026-12-25 expiry. Each folder carries a `MANIFEST.sha256` (verify with `sha256sum -c MANIFEST.sha256` from inside the folder) and a `PROVENANCE.json`. The manifest covers every file except itself and the provenance file.

| Id | Run | Artifact (id) | Head sha | Files | Bytes | `MANIFEST.sha256` digest |
|---|---|---|---|---:|---:|---|
| E1 | 36230165655 | `zh-small-pilot` (10902213303) | `4fd7d83` | 121 | 29289300 | `24599cc8064108c0600d81247315e35fc0fa6834d8e1db094c2aeb5f51de6a72` |
| E2 | 36233756867 | `zh-small-pilot-journeys-once` (10903263307) | `b2c02ca` | 86 | 17654754 | `7c8a73493bc859d359938a4e9cbabfe297a0ab01913ba5ae4ced836e39d8d0db` |

Head shas are the short forms cited in the PR #40 review; the full shas were not resolvable locally. Both manifests were verified (`sha256sum -c`, all files OK) after writing.

The hashes prove the copies have not changed since 2026-10-24. They do not prove the copies equal the original artifacts, because the artifacts were not hashed at source.

## Not available

- **Theatre raw evidence.** Only `theatre/runs/zh-small-pilot-2026-10-09.summary.json` exists. Raw events and evidence are unavailable.
- **Durable off-host copy.** The only copy is on the one workstation. Until an off-host copy exists, the GitHub artifacts (expiring 2026-12-25) and that single disk are the only holders.
- **Full head shas** for E1 and E2 (see above).
- E3 (`deterministic-pilot-20260929T100045Z`) was already covered by its own `artifact-manifest.sha256` and is not re-recorded here.
