# Legacy SQLite Supplements

Keep `db/osu_rmp.sqlite` as a local source archive. The supported collector writes
to PostgreSQL; no SQLite content, snapshots, or exports belong in Git.

```sh
python3 scripts/import_rmp_supplement.py --dry-run
python3 scripts/import_rmp_supplement.py
```

The importer takes an online SQLite backup through a read-only connection, checks
its integrity, and compares it with a consistent PostgreSQL snapshot. Temporary
comparison files are automatically removed. It does not run network collection
or modify either source dataset. PostgreSQL inserts are limited to
`osu_rmp.legacy_supplement`, with a nonblocking advisory lock and short lock timeout.

SQLite-only professors and reviews without an exact PostgreSQL match are retained
with their original payload, source filename, source key, school ID, and last-seen
time. Review matching requires the same professor, date, raw course, comment,
quality, and difficulty. A SQLite content fingerprint is not a RMP review ID.
Independent source reviews with identical content remain independent in PostgreSQL;
ambiguous matches are counted and never assigned a guessed source ID.

Run the importer again after a normal collector refresh. Previously preserved
reviews gain `matched_review_id` only when exactly one actual RMP review matches.
Their original supplement payload remains available for provenance. Repeated
imports update changed supplement payloads only, without duplicate rows or
reimporting the main dataset. The script prints aggregate counts rather than
review text or individual identities.

Supplements remain separate from application ratings and official SEI/SSLE. This
avoids double counting comments while awaiting a confirmed source ID.
