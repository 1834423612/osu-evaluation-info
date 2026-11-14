# All-campus identity audit — November 13, 2026

English · [简体中文](../zh-CN/rmp/research-audit-2026-11-13.md)

The audit queried official people services for all 7,758 previously unlinked RMP profiles, with separate web searches and departmental/historical PDF evidence. Source-assisted coverage does not mean every search result was read manually; an empty search does not prove that someone never taught at OSU.

## Applied results

| Measure                           | Count |
| --------------------------------- | ----: |
| RMP profiles                      | 9,392 |
| Linked before                     | 1,634 |
| Net additions                     | 2,054 |
| Linked after                      | 3,688 |
| Distinct linked official accounts | 3,563 |
| Still unlinked                    | 5,704 |

Profiles and accounts are not distinct people: one person can have multiple campus profiles or unresolved historic account aliases.

| Campus    | Profiles | Linked | Unlinked |
| --------- | -------: | -----: | -------: |
| Columbus  |    8,386 |  3,343 |    5,043 |
| Lima      |      108 |     53 |       55 |
| Mansfield |      153 |     55 |       98 |
| Marion    |      379 |     73 |      306 |
| Newark    |      326 |    149 |      177 |
| Wooster   |       40 |     15 |       25 |

Unresolved: 4,514 lacked a verifiable compatible-name account; 1,174 had name leads without sufficient campus, personal-course or departmental evidence; 16 had multiple equally supported accounts. Names, nicknames and account resemblance do not establish identity.

For 145 additions, a unique official account and department were confirmed but campus evidence was absent. Campus retained its RMP provenance with `official_campus_verified: false`; no official teaching record was fabricated or known conflicting campus overwritten.

## Sources and cache

The main directory covered 7,758 profiles; the secondary service covered 6,722; 1,555 profiles also had exact-account candidate checks. Web work attempted 4,511 distinct official HTML URLs and 1,112 focused historical PDF URLs. Failed, truncated and unparseable responses retain their states.

The people cache contained 3,038 accounts: 2,026 from OSU Search, 787 from the legacy API and 225 from verified departmental contact blocks. These include candidates and are not a count of new links. Current roles require explicit current official evidence; historical PDF titles remain historical. Unproved staff types stay unknown.

Decisions and evidence for every profile, including unresolved cases, are stored in the research tables. Source RMP profiles and reviews were neither merged nor rewritten.

## Reproducibility

After a complete course-mapping refresh, replaying the saved evidence reproduced accounts, statuses, reasons and identity classifications with SHA-256:

```text
aca7fcd48e967403e642be77e75fc16fd0535b180ac0cde9101d634fabcb85da
```

The 9,392 source profiles and 105,000 source reviews retained their original fingerprints:

```text
profiles: 835cc353e0212127aec29959e533a18b
reviews:  541d1291e8a2f37e635706ae57294425
```

Validation included 59 RMP Python regressions, 35 research/PDF unit checks, two real-database research checks, 40 directory checks, 17 database course-query checks and 18 catalog/syllabus archival recovery checks. See [identity research](identity-research.md) for scan, apply and replay commands. New profiles can be scanned again; failed requests are retryable and manual decisions survive.

## Retention boundary

At audit time, migration 3 protected complete course/section snapshots, syllabus indexes and document versions from deletion, truncation and overwrite. The server held 8,322 distinct syllabus documents and 9,181 versions. Later term-head behavior is documented in the [lifecycle guide](../catalog/lifecycle.md).

This protects fetched database content, not never-fetched data or an offline binary mirror of external images, fonts and attachments.
