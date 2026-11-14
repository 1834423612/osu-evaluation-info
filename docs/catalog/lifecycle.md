# Catalog and syllabus retention

English · [简体中文](../zh-CN/catalog/lifecycle.md)

## Latest verified does not mean final

OSU exposes no reliable signal that a term will never change again. The archive records the latest complete verification, not a final version inferred from dates, a 404, timeout or empty response. Catalog records retain publication and term-discovery observations. Syllabi preserve official `modifiedAt`; a backup check is not an official modification.

Each term has one selected archive head: its latest successfully validated complete version. It is neither the largest version nor a union of history, which could restore corrected/deleted courses to the current catalog. Historical versions remain permanently available for audit and recovery.

| Observation                                                    | Current catalog                            | Retained copy                                                                |
| -------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| OSU still lists a term                                         | Continue syncing regardless of date        | Keep successful versions                                                     |
| Course, teacher or schedule changes                            | Publish a newly validated complete version | Keep the prior version                                                       |
| A course or section disappears                                 | Omit it from the new current version       | Saved items can read the latest complete copy containing it, marked archived |
| A term disappears from discovery                               | Mark `not-listed`; retain its head         | Do not delete or overwrite with empty records                                |
| Timeout, failed pagination, count drift or abnormal empty term | Reject incomplete publication              | Serve the last complete version                                              |
| A term reappears                                               | Resume syncing and accept corrections      | Keep its history                                                             |

Without reliable discovery evidence, status stays `unknown`. Completeness checks cannot prove that the official source itself is free of business errors, so even legitimate smaller publications retain recoverable history.

## Catalog

Run `pnpm catalog:migrate`; schema version 4 adds term heads and discovery observations.

- `snapshot_versions` publishes only after all partitions, counts and parent/child identities pass validation.
- `term_archives` selects one head per term and records complete official discovery from successful publications.
- Search and mirror browsing list retained terms. Default selection favors a still-listed official term; archives can be selected explicitly.
- Current reads use the selected head, never a historical union.
- Detail fallback can recover the latest complete version containing a removed course, constrained by term, campus, subject and full number. It is labelled absent from the latest catalog and cannot supply live seats.
- Favorites retain their device-local snapshots; server history is an additional recovery source.
- Published course/section versions cannot be deleted, truncated or overwritten. Legacy cleanup is a no-op.

```sql
SELECT term_code,run_id,completed_at,source_status,source_checked_at
FROM osu_catalog.term_archives ORDER BY term_code DESC;
```

## Syllabi

Run `pnpm syllabus:migrate`; schema version 4 adds complete index heads and term evidence.

- `term_discoveries` appends successful discovery observations.
- `index_heads` selects the latest fully count-validated index for each term.
- Removed entries disappear from the current index, while persistent entries and document history remain readable by code.
- No-longer-published terms retain their indexes and skip invalid old document requests.
- Resumed checkpoints add newly published terms immediately and prioritize their documents.
- An abnormal empty index cannot replace a nonempty complete one.
- Document ordering uses parseable official modification time and first retrieval time; rechecking an older version never promotes it.
- Documents, indexes and discovery evidence have database protection.

```sql
SELECT code,name,run_id,source_status,source_checked_at
FROM osu_syllabus.term_archives ORDER BY code DESC NULLS LAST;
```

The archive stores HTML and structure, not a complete offline mirror of external images, fonts or attachments. Never-fetched or previously removed content cannot be reconstructed.

## Verification

Database tests use random temporary schemas. They cover disappearing/reappearing terms, current changes and removals, failed-publication rollback, historical detail recovery, index removals, abnormal empties, old document rechecks and new terms in resumed runs. Business tables are not cleared.

```sh
CATALOG_DATABASE_TEST=1 SYLLABUS_DATABASE_TEST=1 node --env-file-if-exists=.env.local --test \
  tests/catalog/term-archives.integration.test.mjs \
  tests/catalog/snapshots.integration.test.mjs \
  tests/catalog/sync-cli.integration.test.mjs \
  tests/syllabus/storage.integration.test.mjs
```

A 2026-11-13 live check reconciled and published 70,550 official sections and a complete 8,977-entry syllabus index. Document work continued from its checkpoint without replacing or deleting retained content. These are dated observations, not current counts.
