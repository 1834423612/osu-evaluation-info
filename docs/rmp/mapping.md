# RMP and OSU Instructor Mapping

English · [简体中文](../zh-CN/rmp/mapping.md)

`osu_rmp.professor` and `osu_eval.instructor` keep their source identifiers and
schemas. The additive mapping layer stores OSU identities by `name_dot_number`,
official course facts by source and class, and RMP-to-OSU decisions in
`osu_rmp.professor_identity_map`. RMP reviews remain keyed by the collector's
stable review ID, so later collection runs merge into the same tables.

Run `python3 scripts/rmp/sync_rmp_mappings.py --dry-run` to inspect aggregate
candidate counts. Dry-run mode is read-only and requires the additive app
schema to have been installed by a normal sync already. The scheduled form
omits `--dry-run`; it updates OSU identity
and official course facts, refreshes evidence-backed candidates, and preserves
manual decisions. By default it reads all available complete catalog terms and
active official SEI/SSLE evaluation history (`--term-window 0`). A positive window
can bound an investigative run. In-progress catalog terms are held out until
their snapshot completes. Source reads share a read-only repeatable snapshot.

To review weaker exact-name matches, export the current read-only candidate
set as UTF-8 JSON Lines:

```sh
python3 scripts/rmp/sync_rmp_mappings.py --dry-run \
  --export-candidates /tmp/osu-rmp-mapping-candidates.jsonl
```

Each line contains the RMP profile ID and source details, OSU username and name
variants, proposed score, and the campus, department, and course evidence used
by the matcher. Confirm a candidate from reliable public evidence before
recording it with `--accept`; use `--reject` for a confirmed different person.
Do not bulk-accept by name or proposed score. The export option requires
`--dry-run` and never changes mapping rows.

Automatic acceptance requires an exact normalized name, matching campus,
academic evidence, an overlapping course, and exactly one fully supported official
identity for that RMP profile. Academic evidence can be an exact
department, a reviewed department-label equivalent, or an official subject taught
at that campus whose name matches the RMP department. This avoids treating
regional administrative labels such as “Mansfield Campus” as academic departments.
`department_alias` stores reviewed equivalents with official evidence
URLs; similar strings alone never create aliases. We retain weaker exact-name matches as
`candidate` for review. Multiple source profiles can point to the same verified
OSU instructor, including at one campus. Source profiles and review IDs remain
separate; competing official identities for a source profile are not auto-accepted.
Explicit manual campus reservations continue to take priority.

The v2 mapping layer records each changed automatic candidate/evidence set in
`mapping_refresh` and `mapping_refresh_item`, including the source-term window
and aggregate counts. Its SHA-256 digest avoids duplicate snapshots on
unchanged refreshes. Official historical name observations are included only
under their existing OSU username, retaining an audit trail for name variants
without a fuzzy-name merge.

The v4 layer also reconciles every active review course label against the official
catalog. It derives subject abbreviations from source labels and requires the
exact catalog number and suffix. Ambiguous abbreviations need department or
taught-subject evidence; an unrelated subject offering the same number is not
sufficient. Actual active review labels supplement cached RMP profile course
lists. See [course reconciliation and full audits](course-matching.md).

The v3 layer adds the department equivalence registry and compares uniqueness
among candidates with all required evidence. This avoids rejecting a complete
match because an unrelated person shares a name. On 2026-11-05, the refresh read
9,309 official identities and 106,855 course facts: accepted RMP links increased
from 540 to 729, with 2,541 weaker candidates retained for review. These counts
describe this local snapshot, not a coverage guarantee for all OSU faculty.

Reviewed decisions can be recorded with:

```sh
python3 scripts/rmp/sync_rmp_mappings.py --accept 123456:smith.42 --reason "Verified from department faculty page"
python3 scripts/rmp/sync_rmp_mappings.py --reject 123456:jones.8 --reason "Different person; same name"
```

The identity must exist in one of the official snapshots. Manual decisions are
stored with method `manual` and audited in `osu_rmp.mapping_decision_log`; future
automatic refreshes do not overwrite them. If accepting a profile already
manually accepted for a different OSU identity, reject the previous decision in
one run, then accept the new identity in a later run.

The application keeps identity match and course-history availability separate:
an exact OSU email can identify a teacher even when there are no evaluations
for that course. It never labels the teacher as unmatched solely because that
course has no historical row. Applications can query `osu_rmp.accepted_identity` for one accepted row per
active RMP profile and `osu_rmp.review_query` for original normalized reviews.
Applications use `osu_rmp.course_review_query`, filtering by `professor_id`,
`campus_code` and `matched_course_key`, to include accepted aliases without
rewriting source labels or duplicating reviews. Aggregate recent review count, difficulty,
and other ratings. Keep OSU SEI/SSLE queries separate so their response counts
and term-level ratings are never blended with RMP student reviews.
