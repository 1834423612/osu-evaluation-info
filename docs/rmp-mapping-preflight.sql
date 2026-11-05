-- Read-only preflight for a proposed OSU/RMP mapping refresh.
-- Run in psql before manual decisions; no raw source rows are changed.
SELECT state, method, count(*) AS mappings
FROM osu_rmp.professor_identity_map
GROUP BY state, method
ORDER BY state, method;

SELECT
  (SELECT count(*) FROM osu_eval.instructor) AS evaluation_identities,
  (SELECT count(*) FROM osu_eval.evaluation) AS evaluation_records,
  (SELECT count(*) FROM osu_rmp.professor WHERE active) AS active_rmp_profiles,
  (SELECT count(*) FROM osu_rmp.review WHERE active) AS active_rmp_reviews;

-- An exact official identity without course-specific history is expected;
-- it is not an identity mismatch.
SELECT count(DISTINCT f.name_dot_number) AS known_identities_without_history
FROM osu_rmp.instructor_course f
JOIN osu_eval.instructor i ON i.name_dot_number=f.name_dot_number
WHERE f.active AND f.source='official_catalog'
  AND NOT EXISTS (
    SELECT 1
    FROM osu_eval.evaluation e
    JOIN osu_eval.section sec ON sec.id=e.section_id
    JOIN osu_eval.course c ON c.id=sec.course_id
    JOIN osu_eval.subject subj ON subj.id=c.subject_id
    WHERE e.instructor_id=i.id AND subj.code=f.subject
      AND c.catalog=f.catalog_number AND sec.campus_code=f.campus_code
  );
