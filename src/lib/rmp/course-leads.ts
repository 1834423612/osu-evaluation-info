import type { RmpProfile } from "./library-types";
export type RmpCourseLead = Pick<
  RmpProfile,
  "id" | "name" | "department" | "campuses" | "username"
> & {
  courseReviewCount: number;
  courseQuality: number | null;
  courseDifficulty: number | null;
  courseLabels: string[];
};
export type RmpCourseLeads = {
  profiles: RmpCourseLead[];
  total: number;
  nextOffset: number | null;
};
export const COURSE_LEADS_SQL = `WITH candidates AS (
 SELECT r.professor_id,count(*)::int "courseReviewCount",
   avg(coalesce((r.helpful_rating+r.clarity_rating)/2,r.helpful_rating,r.clarity_rating))::float8 "courseQuality",
   avg(r.difficulty_rating)::float8 "courseDifficulty",array_agg(DISTINCT btrim(r.class_name) ORDER BY btrim(r.class_name)) "courseLabels"
 FROM osu_rmp.course_review_query r WHERE r.campus_code=$1 AND r.matched_course_key=$2
 AND NOT EXISTS(SELECT 1 FROM osu_rmp.professor_identity_map m WHERE m.professor_id=r.professor_id AND m.state='accepted'
  AND (m.method='manual' OR m.evidence->'campus_codes' ? $1)
  AND (m.name_dot_number=ANY($3::text[]) OR ($4::boolean AND EXISTS(
    SELECT 1 FROM osu_rmp.instructor_course ic WHERE ic.name_dot_number=m.name_dot_number AND ic.active AND ic.campus_code=$1 AND ic.course_key=$2))))
 GROUP BY r.professor_id
), selected AS (SELECT *,count(*) OVER()::int total FROM candidates ORDER BY "courseReviewCount" DESC,professor_id LIMIT 24 OFFSET $5)
 SELECT p.legacy_id::text id,concat_ws(' ',p.first_name,p.last_name) name,coalesce(p.department,'') department,
  m.name_dot_number username,ARRAY[$1::text] campuses,
  selected."courseReviewCount",selected."courseQuality",selected."courseDifficulty",selected."courseLabels",selected.total
 FROM selected JOIN osu_rmp.professor p ON p.legacy_id=selected.professor_id
 LEFT JOIN osu_rmp.professor_identity_map m ON m.professor_id=p.legacy_id AND m.state='accepted'
 LEFT JOIN osu_rmp.instructor_identity i USING(name_dot_number)
 ORDER BY selected."courseReviewCount" DESC,selected.professor_id`;
