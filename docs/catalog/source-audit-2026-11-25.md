# Official source and archive comparison — November 25, 2026

English · [简体中文](../zh-CN/catalog/source-audit-2026-11-25.md)

## Findings

The November 25 catalog failures were triggered by disagreement inside the official response and a synchronizer assumption that every parent course must have the requested subject. The archive's stored parent relationships were intact. This identifies the protocol disagreement; it does not establish whether OSU intended a course recategorization, cross-listing or a temporary indexing correction.

[Run 45713682507](https://github.com/1834423612/osu-evaluation-info/actions/runs/45713682507) and [run 45589188326](https://github.com/1834423612/osu-evaluation-info/actions/runs/45589188326) failed in `snapshot-ingestion` with `CATALOG_DATA_INVALID: Official result belongs to a different subject.` The failure occurred in page preparation, before SQL writes for that page. Existing logs omitted the offending request and record.

Repeated requests to the [official AIRSCI search](https://content.osu.edu/v2/classes/search?term=1272&subject=airsci&p=1), including a different sort order and an exact `1155.01` query, reproduced this record:

| Field          | Official parent     | Official section                         |
| -------------- | ------------------- | ---------------------------------------- |
| JSON path      | `courses[4].course` | `courses[4].sections[0]`                 |
| Course ID      | `165133`            | `165133`                                 |
| Subject        | `KNSFHP`            | `Air Force Aerospace Studies`            |
| Catalog number | `1155.03`           | `1155.01` in both section catalog fields |
| Class number   | —                   | `14598`                                  |
| Parent key     | —                   | `165133-1-1272`                          |

The selected subject facet identifies `airsci` as `Air Force Aerospace Studies`. Both section subject labels agree with it. The accepted archive contained 22 AIRSCI sections, all matching the current official identities; class `14598` was absent. No existing database match was lost.

The [official MILSCI search](https://content.osu.edu/v2/classes/search?term=1272&subject=milsci&p=1) exposed another case: class `13381`, course `148067`, offering `2`, campus `NWK` now has section subject `Military Science`, while its parent still says `KNSFHP`. The archive's section and parent both previously said `KNSFHP`; this is an observed source classification change, rather than a failed join on course ID, offering or campus.

## Full identity comparison

The source traversal ran on November 25, 2026, from 18:39:24 to 18:42:31 EST (23:39:24–23:42:31 UTC). Its baseline was the accepted publication completed November 24 at 18:09:18 EST. Database reads used a repeatable-read, read-only transaction; no production snapshots, checkpoints, indexes or publication heads were changed.

All 714 discovered partitions and 895 pages were validated. Their 70,613 official hits reconciled exactly with the plan and represented 70,600 distinct term/class identities, including 13 duplicate hits. The archive held 70,563 identities. There were no conflicting cross-page identities or missing archived parent links.

| Term                 | Archived classes | Official distinct classes | Added | Not returned in this traversal | Changed identities |
| -------------------- | ---------------: | ------------------------: | ----: | -----------------------------: | -----------------: |
| Summer 2026 (`1264`) |           15,386 |                    15,389 |     5 |                              2 |                  0 |
| Autumn 2026 (`1268`) |           28,054 |                    28,069 |    17 |                              2 |                  0 |
| Spring 2027 (`1272`) |           27,123 |                    27,142 |    41 |                             22 |                  1 |
| Total                |           70,563 |                    70,600 |    63 |                             26 |                  1 |

The one changed identity is class `13381`: `KNSFHP` → `MILSCI`. The other stable fields agree. In total, 70,536 identities were unchanged. Comparisons use term/class number and check course ID, offering, campus, subject and catalog number; they exclude live enrollment and descriptive body changes. “Not returned” is a dated observation, not proof of permanent deletion. The official API has no snapshot token, so a traversal cannot prove every response belongs to one source revision.

The [complete identity difference list](source-audit-2026-11-25.json) includes all 63 additions, 26 records not returned, the changed identity, 23 partition-count differences and both parent/section discrepancies. It contains course identifiers and observation times, without connection credentials, instructor/contact data or response bodies.

An earlier [November 23 run](https://github.com/1834423612/osu-evaluation-info/actions/runs/45143095394) had a separate failure: 41 coverage regressions. Its 673 saved partitions were all complete and their expected/fetched counts both equaled 64,551. This agrees with the official discovery plan logged by that run and supports source undercoverage rather than local page loss. The coverage guard correctly kept the accepted archive. Today's source values cannot reconstruct every historical response body.

## Handling and reproduction

Page preparation now uses section subject/catalog values only when the selected official facet, both section subject labels, explicit course ID, term, parent key, offering and both catalog fields agree. The original parent subject/catalog/description remain in `officialParentIdentity`. Verified differences emit `catalog.parent_identity_reconciled`; unverified records still fail before the page write. Coverage guards and immutable archives remain enforced.

Errors retain operation, candidate run, partition, page, official URL, source JSON field, expected/actual values, course/class identity and validator file/line. Transport failures also retain status, attempt and the underlying cause. Actions annotations point to the validator; the summary includes field comparisons and verified parent/section differences. Credentials are redacted and source bodies are omitted.

Inspect one complete subject without writing data:

```sh
node scripts/catalog/inspect-official.mjs --term 1272 --subject airsci
node scripts/catalog/inspect-official.mjs --term 1272 --subject airsci --compare-archive
node scripts/catalog/inspect-official.mjs --term 1272 --subject milsci --compare-archive
```

The first command needs only installed runtime dependencies and official network access. `--compare-archive` additionally loads `DATABASE_URL` from the environment or `.env.local`, reads the latest accepted term archive in a read-only transaction and reports identity additions, absences and changes. Inspection is limited to one subject, optionally `--campus col`, below 10,000 hits, with a two-minute request budget. Differences are observations; malformed data exits with a structured failure. See [scheduled diagnostics](scheduled-sync.md#diagnose-a-failed-run) and [testing](../testing.md).
