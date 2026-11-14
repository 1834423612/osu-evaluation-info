# RMP collection comparison — November 3, 2026

English · [简体中文](../zh-CN/rmp/collection-comparison-2026-11-03.md)

This historical audit compares the PostgreSQL collector's export with a consistent SQLite backup taken during a second client's run. It describes the implementations and data at that date, not the current application's RMP support. Current collection, mapping and serving behavior is documented in [RMP import](import.md), [course reconciliation](course-matching.md) and the [faculty library](library.md).

## Snapshot and overlap

The PostgreSQL export held 9,392 profiles and 105,000 unique reviews. The consistent SQLite snapshot held 9,392 profiles and 58,661 reviews; a later read reached 59,805, confirming that collection was still progressing. SQL text size and SQLite file size are not comparable measures of completeness. A relative SQLite `--db` path resolves from the process working directory.

| Campus / RMP school | Search-reported profiles | PG profiles | SQLite profiles | PG reviews | SQLite reviews |
| ------------------- | -----------------------: | ----------: | --------------: | ---------: | -------------: |
| Columbus / 724      |                    8,409 |       8,386 |           8,388 |     95,979 |         51,556 |
| Marion / 723        |                      379 |         379 |             377 |      1,997 |          1,997 |
| Lima / 725          |                      108 |         108 |             108 |        721 |              0 |
| Mansfield / 726     |                      153 |         153 |             153 |      1,374 |            184 |
| Newark / 2610       |                      326 |         326 |             326 |      4,767 |          4,762 |
| Wooster / 5207      |                       40 |          40 |              40 |        162 |            162 |
| Total               |                    9,415 |       9,392 |           9,392 |    105,000 |         58,661 |

The profile intersection was 9,369, with 23 unique profiles on each side, all with zero ratings. Their union was 9,415, matching the sum of the six school search totals. This supports a profile-list discrepancy, not proof of permanent online completeness. Shared profiles had no campus mismatch.

The slow client's school/professor string ordering explained its uneven progress: Newark, Wooster and Marion were advanced while Lima and most Mansfield pages were pending. Matching reviews by its content fingerprint also lost distinctions when timestamps were truncated to the same day. It cannot replace immutable review-ID matching.

## Request design and timing

| Behavior at audit time | PostgreSQL collector                 | SQLite client                                         |
| ---------------------- | ------------------------------------ | ----------------------------------------------------- |
| API                    | Direct GraphQL                       | `ratemyprofessors-client==3.0.2` GraphQL              |
| Profile page           | 100 default                          | 50 fixed                                              |
| Review page            | 100 per teacher default              | 20 fixed                                              |
| Batch                  | 10 teachers default, maximum 20      | One teacher/page                                      |
| Pacing                 | At least 10 seconds                  | Random 3–4 seconds default                            |
| Concurrency            | Serial                               | Serial                                                |
| Resume                 | Persisted per-teacher cursor         | Restart unfinished teacher, fingerprint deduplication |
| Retry                  | Up to five attempts; 429 Retry-After | Client retries disabled; later runs retry some errors |
| Storage                | Structured PG fields and raw JSON    | SQLite WAL and model JSON                             |

Batching reduces request count, not a guaranteed wall-clock multiplier. The PG run lasted approximately 2 h 16 min; export metadata did not preserve the exact page/batch parameters, so its request count cannot be reconstructed precisely.

At the consistent snapshot, 3,440 rated profiles remained unfinished in SQLite. Using PG review counts and 20-review pages estimated 4,606 requests: Columbus 4,367, Lima 93, Mansfield 146. Pacing alone implied 3.84–5.12 hours at 3–4 seconds, before network and retries. This estimate applies only to that snapshot.

## Field preservation

PG retained immutable review IDs, full timestamps, separate helpfulness/clarity, difficulty, re-enrollment, online/credit/attendance/grade/textbook fields, tags, votes, teacher replies and raw JSON. SQLite payloads were parsed model JSON, not raw GraphQL. They retained tags, votes and some details but discarded review IDs and timestamp precision, sometimes substituted the current date on parse failure, and collapsed quality to clarity. PG had 22,224 reviews with distinct helpfulness and clarity values. SQLite model distribution/tag keys existed but were empty in this snapshot.

| PG field                 | Observed coverage | Interpretation                                          |
| ------------------------ | ----------------: | ------------------------------------------------------- |
| Nonempty comments        | 104,993 / 105,000 | Seven comments were empty                               |
| Raw course labels        |           104,997 | Not official course identities                          |
| Professor distributions  |    8,210 profiles | Assess sample/distribution, not just means              |
| Professor course lists   |    8,199 profiles | Course-association evidence                             |
| Review tags              |   43,920 (41.83%) | Workload and style observations                         |
| Attendance               |   54,540 (51.94%) | Historical formats need normalization                   |
| Re-enrollment            |   40,973 (39.02%) | 32,085 yes; 8,888 no; the rest unknown                  |
| Grade                    |   49,693 (47.33%) | Includes non-grade values; not an official distribution |
| Any up/down vote         |   27,645 (26.33%) | Does not establish authenticity                         |
| Explicit online flag     |             7,864 | False is not universal proof of in-person delivery      |
| Teacher replies          |                25 | Additional context                                      |
| Professor aggregate tags |                 0 | Not a populated feature source then                     |

Helpfulness ratings are separate from votes on whether a review was helpful. At the cutoff, dates spanned 2000-12-16 through 2026-11-03; 17,536 reviews (16.70%) were within three years and 6,241 (5.94%) within one year. Historical profiles are not a current faculty headcount.

## Cleaning and consistency findings

- Both sources had 1,182 zero-rating profiles. Zero means/difficulty and negative re-enrollment sentinels are unknown, not actual zero scores. Negative percentages affected 3,833 profiles.
- `rating_tags` contained 61,080 empty arrays and 43,920 `--`-delimited strings despite being JSONB. Preserve raw values and normalize explicitly.
- Attendance mixed mandatory/nonmandatory/Y/N/empty values. Textbook was not a boolean: among 90,391 non-NULL values, 12,077 were `-1` and 13,166 were `0`. Grade includes undecided, withheld and withdrawal values.
- Course labels include abbreviations, punctuation, old numbers and bare digits. Catalog and departmental evidence are required; punctuation removal alone is insufficient.
- PG `num_ratings` summed to 104,216 versus 105,000 paged reviews. Actual counts were higher for 798 teachers, lower for 35 and equal for 8,559. That discrepancy alone does not prove missing pages.
- Unique stored reviews, summed `reviews_loaded` and distribution totals all equalled 105,000, with no duplicate review IDs or orphaned professor references. This is internal consistency evidence, not proof against all upstream omissions.

## Historical recommendations and current references

The audit prioritized immutable review IDs, timestamp preservation, cursor-progress checks, explicit missing/failed states, actual stored counts and source-removal observation. It also recommended identity evidence and course mappings before attaching RMP to official teaching records, with separate SEI/SSLE and RMP scores. These recommendations are historical; consult current guides rather than treating them as an unfinished task list.

For SQLite backups, use its backup API while running or close cleanly before copying. Do not copy only the main file during WAL writes or delete WAL/SHM files. Temporary analysis copies are not durable backups.

Current sources: [collector](../../scripts/rmp/collect_rmp_osu.py), [RMP schema](../../db/schemas/rmp.sql), [evaluation repository](../../src/lib/evaluations/repository.ts). All counts in this report refer to the dated snapshots, not the current source.
