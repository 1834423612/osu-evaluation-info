// Raw source profiles stay accessible independently of identity reconciliation.
export const LIBRARY_PROFILE_FIELDS = `p.legacy_id::text id,concat_ws(' ',p.first_name,p.last_name) name,
  coalesce(p.department,'') department,p.active,p.avg_rating::float8 quality,p.avg_difficulty::float8 difficulty,
  p.would_take_again_percent::float8 "wouldTakeAgain",p.num_ratings "sourceReviewCount",
  p.updated_at::text "updatedAt",p.rating_tags tags,p.ratings_distribution distribution,
  m.name_dot_number username,i.display_name "officialName",
  ARRAY(SELECT DISTINCT s.campus_code FROM osu_rmp.professor_school ps JOIN osu_rmp.school s ON s.legacy_id=ps.school_id WHERE ps.professor_id=p.legacy_id ORDER BY s.campus_code) campuses,
  (SELECT count(*)::int FROM osu_rmp.review r WHERE r.professor_id=p.legacy_id) "storedReviewCount",
  (SELECT count(*)::int FROM osu_rmp.review r WHERE r.professor_id=p.legacy_id AND NOT r.active) "archivedReviewCount"`;
export const LIBRARY_PROFILE_JOINS = `FROM osu_rmp.professor p
  LEFT JOIN osu_rmp.professor_identity_map m ON m.professor_id=p.legacy_id AND m.state='accepted'
  LEFT JOIN osu_rmp.instructor_identity i USING(name_dot_number)`;
export const LIBRARY_SEARCH_SQL = `WITH selected AS (
  SELECT p.legacy_id,count(*) OVER()::int total ${LIBRARY_PROFILE_JOINS}
  WHERE ($1='ALL' OR EXISTS(SELECT 1 FROM osu_rmp.professor_school ps JOIN osu_rmp.school s ON s.legacy_id=ps.school_id WHERE ps.professor_id=p.legacy_id AND s.campus_code=$1))
    AND ($2='all' OR ($2='verified')=(m.name_dot_number IS NOT NULL))
    AND NOT EXISTS(SELECT 1 FROM unnest($3::text[]) t(token) WHERE
      concat_ws(' ',p.first_name,p.last_name,p.department,m.name_dot_number,p.legacy_id::text) NOT ILIKE '%'||t.token||'%' ESCAPE '\\'
      AND regexp_replace(p.course_codes::text,'[^[:alnum:].]','','g') NOT ILIKE '%'||regexp_replace(t.token,'[ -]','','g')||'%' ESCAPE '\\'
      AND NOT EXISTS(SELECT 1 FROM osu_rmp.course_identity_match cm WHERE cm.professor_id=p.legacy_id AND cm.state='accepted' AND cm.course_key ILIKE '%'||t.token||'%' ESCAPE '\\')
      AND NOT EXISTS(SELECT 1 FROM osu_rmp.review r WHERE r.professor_id=p.legacy_id
        AND coalesce(r.class_name,'') ILIKE '%'||t.token||'%' ESCAPE '\\'))
  ORDER BY p.active DESC,p.num_ratings DESC,p.last_name,p.first_name,p.legacy_id
  LIMIT $4 OFFSET $5
) SELECT ${LIBRARY_PROFILE_FIELDS},selected.total FROM selected JOIN osu_rmp.professor p USING(legacy_id)
  LEFT JOIN osu_rmp.professor_identity_map m ON m.professor_id=p.legacy_id AND m.state='accepted'
  LEFT JOIN osu_rmp.instructor_identity i USING(name_dot_number)
  ORDER BY p.active DESC,p.num_ratings DESC,p.last_name,p.first_name,p.legacy_id`;
export const LIBRARY_COURSES_SQL = `SELECT btrim(coalesce(class_name,'')) code,count(*)::int count,
  count(*) FILTER(WHERE active)::int "activeCount",
  avg(coalesce((helpful_rating+clarity_rating)/2,helpful_rating,clarity_rating)) FILTER(WHERE active)::float8 quality,
  avg(difficulty_rating) FILTER(WHERE active)::float8 difficulty
  FROM osu_rmp.review WHERE professor_id=$1::bigint GROUP BY 1 ORDER BY count(*) DESC,1`;
export const LIBRARY_REVIEWS_SQL = `WITH matching AS (
  SELECT * FROM osu_rmp.review WHERE professor_id=$1::bigint AND ($2::text IS NULL OR btrim(coalesce(class_name,''))=$2)
), page AS (SELECT * FROM matching ORDER BY osu_rmp.review_day(date_text) DESC NULLS LAST,legacy_id DESC LIMIT $3 OFFSET $4)
  SELECT (SELECT count(*)::int FROM matching) total,coalesce(jsonb_agg(jsonb_build_object(
    'id',legacy_id::text,'course',coalesce(class_name,''),'date',osu_rmp.review_day(date_text)::text,
    'quality',coalesce((helpful_rating+clarity_rating)/2,helpful_rating,clarity_rating),'difficulty',difficulty_rating,
    'comment',coalesce(comment,''),'tags',osu_rmp.tag_array(rating_tags),'active',active,
    'wouldTakeAgain',would_take_again,'grade',grade,'attendance',attendance_mandatory,
    'textbook',textbook_use,'online',is_for_online_class,'forCredit',is_for_credit,
    'thumbsUp',thumbs_up_total,'thumbsDown',thumbs_down_total,
    'teacherReply',CASE WHEN nullif(teacher_note->>'comment','') IS NOT NULL THEN jsonb_build_object('comment',teacher_note->>'comment','date',teacher_note->>'createdAt') END
  ) ORDER BY osu_rmp.review_day(date_text) DESC NULLS LAST,legacy_id DESC),'[]'::jsonb) reviews FROM page`;
