# RMP and OSU Instructor Mapping

`osu_rmp.professor` and `osu_eval.instructor` keep their source identifiers and
schemas. The additive mapping layer stores OSU identities by `name_dot_number`,
recent official course facts by source and class, and RMP-to-OSU decisions in
`osu_rmp.professor_identity_map`. RMP reviews remain keyed by the collector's
stable review ID, so later collection runs merge into the same tables.

Run `python3 scripts/sync_rmp_mappings.py --dry-run` to inspect aggregate
candidate counts. The scheduled form omits `--dry-run`; it updates OSU identity
and recent course facts, refreshes evidence-backed candidates, and preserves
manual decisions. It reads the eight newest complete catalog terms and active
official SEI/SSLE evaluation terms. In-progress catalog terms are held out until
their snapshot completes.

Automatic acceptance requires an exact normalized name, matching campus, an
exact department name, an overlapping course, and unique evidence for that
RMP profile and OSU identity at that campus. We do not infer aliases from
similar course or department strings. We retain weaker exact-name matches as
`candidate` for review. Separate RMP profiles for the same OSU instructor may
be accepted at different campuses; the original RMP IDs stay distinct.

Reviewed decisions can be recorded with:

```sh
python3 scripts/sync_rmp_mappings.py --accept 123456:smith.42 --reason "Verified from department faculty page"
python3 scripts/sync_rmp_mappings.py --reject 123456:jones.8 --reason "Different person; same name"
```

The identity must exist in one of the official snapshots. Manual decisions are
stored with method `manual` and audited in `osu_rmp.mapping_decision_log`; future
automatic refreshes do not overwrite them. If accepting a profile already
manually accepted for a different OSU identity, reject the previous decision in
one run, then accept the new identity in a later run.

Applications can query `osu_rmp.accepted_identity` for one accepted row per
active RMP profile and `osu_rmp.review_query` for active reviews with normalized
course/date fields. To show course-specific data, filter the review view by
`professor_id` and `course_key`, then aggregate recent review count, difficulty,
and other ratings. Keep OSU SEI/SSLE queries separate so their response counts
and term-level ratings are never blended with RMP student reviews.
