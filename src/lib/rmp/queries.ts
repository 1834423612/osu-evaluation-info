// Shared by serving code and database integration checks.
export const COURSE_SQL = `
  WITH matched AS (
    SELECT DISTINCT m.professor_id, m.name_dot_number, i.display_name
    FROM osu_rmp.professor_identity_map m
    JOIN osu_rmp.instructor_identity i USING (name_dot_number)
    JOIN osu_rmp.professor p ON p.legacy_id = m.professor_id AND p.active
    WHERE m.state = 'accepted' AND m.name_dot_number = ANY($1::text[])
      AND (m.method='manual' OR m.evidence->'campus_codes' ? $2)
      AND EXISTS (
        SELECT 1 FROM osu_rmp.professor_school ps
        JOIN osu_rmp.school s ON s.legacy_id = ps.school_id
        WHERE ps.professor_id = p.legacy_id AND s.campus_code = $2
      )
    ORDER BY m.name_dot_number, m.professor_id
    LIMIT 120
  )
  SELECT m.professor_id::text, m.name_dot_number, m.display_name,
    stats.review_count, stats.recent_review_count,
    stats.recent_quality, stats.recent_difficulty,
    stats.recent_quality_count, stats.recent_difficulty_count,
    stats.historical_difficulty, stats.historical_difficulty_count,
    stats.latest_review_date, stats.refreshed_at,
    coalesce(comments.reviews, '[]'::jsonb) AS reviews,
    coalesce(tags.top_tags, '[]'::jsonb) AS top_tags
  FROM matched m
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS review_count,
      count(*) FILTER (WHERE r.review_date BETWEEN $4::date AND CURRENT_DATE)::int AS recent_review_count,
      avg(coalesce((r.helpful_rating + r.clarity_rating) / 2, r.helpful_rating, r.clarity_rating))
        FILTER (WHERE r.review_date BETWEEN $4::date AND CURRENT_DATE)::float8 AS recent_quality,
      avg(r.difficulty_rating)
        FILTER (WHERE r.review_date BETWEEN $4::date AND CURRENT_DATE)::float8 AS recent_difficulty,
      count(coalesce(r.helpful_rating, r.clarity_rating))
        FILTER (WHERE r.review_date BETWEEN $4::date AND CURRENT_DATE)::int AS recent_quality_count,
      count(r.difficulty_rating)
        FILTER (WHERE r.review_date BETWEEN $4::date AND CURRENT_DATE)::int AS recent_difficulty_count,
      avg(r.difficulty_rating) FILTER (
        WHERE r.difficulty_rating BETWEEN 1 AND 5
          AND (r.review_date <= CURRENT_DATE OR r.review_date IS NULL)
      )::float8 AS historical_difficulty,
      count(*) FILTER (
        WHERE r.difficulty_rating BETWEEN 1 AND 5
          AND (r.review_date <= CURRENT_DATE OR r.review_date IS NULL)
      )::int AS historical_difficulty_count,
      max(r.review_date)::text AS latest_review_date,
      max(r.updated_at)::text AS refreshed_at
    FROM osu_rmp.course_review_query r
    WHERE r.professor_id = m.professor_id AND r.matched_course_key = $3 AND r.campus_code = $2
  ) stats
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', recent.legacy_id::text,
      'date', recent.review_date::text,
      'quality', coalesce((recent.helpful_rating + recent.clarity_rating) / 2,
        recent.helpful_rating, recent.clarity_rating),
      'difficulty', recent.difficulty_rating,
      'comment', left(coalesce(recent.comment, ''), 4000),
      'tags', recent.rating_tags,
      'wouldTakeAgain', recent.would_take_again
    ) ORDER BY recent.review_date DESC NULLS LAST, recent.legacy_id DESC) AS reviews
    FROM (
      SELECT r.* FROM osu_rmp.course_review_query r
      WHERE $5::boolean AND r.professor_id = m.professor_id AND r.matched_course_key = $3 AND r.campus_code = $2
      ORDER BY r.review_date DESC NULLS LAST, r.legacy_id DESC LIMIT 3
    ) recent
  ) comments ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('tag', ranked.tag, 'count', ranked.count)
      ORDER BY ranked.count DESC, ranked.tag) AS top_tags
    FROM (
      SELECT tag, count(*)::int AS count
      FROM osu_rmp.course_review_query r
      CROSS JOIN LATERAL jsonb_array_elements_text(r.rating_tags) AS tag_values(tag)
      WHERE r.professor_id = m.professor_id AND r.matched_course_key = $3 AND r.campus_code = $2
      GROUP BY tag ORDER BY count DESC, tag LIMIT 8
    ) ranked
  ) tags ON true
  ORDER BY m.display_name, m.professor_id
`;

export const REVIEW_PAGE_SQL = `
  WITH professor AS (
    SELECT m.professor_id,m.name_dot_number
    FROM osu_rmp.professor_identity_map m
    JOIN osu_rmp.professor p ON p.legacy_id=m.professor_id AND p.active
    WHERE m.professor_id=$5::bigint AND m.state='accepted'
      AND m.name_dot_number=ANY($1::text[])
      AND (m.method='manual' OR m.evidence->'campus_codes' ? $2)
      AND EXISTS (
        SELECT 1 FROM osu_rmp.professor_school ps
        JOIN osu_rmp.school s ON s.legacy_id=ps.school_id
        WHERE ps.professor_id=p.legacy_id AND s.campus_code=$2
      )
  ), matching AS (
    SELECT r.* FROM professor p
    JOIN osu_rmp.course_review_query r ON r.professor_id=p.professor_id
    WHERE r.matched_course_key=$3 AND r.campus_code=$2
  ), page AS (
    SELECT * FROM matching
    ORDER BY review_date DESC NULLS LAST, legacy_id DESC
    LIMIT $4::int OFFSET $6::int
  )
  SELECT (SELECT count(*)::int FROM matching) AS total,
    coalesce(jsonb_agg(jsonb_build_object(
      'id',page.legacy_id::text,'date',page.review_date::text,
      'quality',coalesce((page.helpful_rating+page.clarity_rating)/2,
        page.helpful_rating,page.clarity_rating),
      'difficulty',page.difficulty_rating,
      'comment',left(coalesce(page.comment,''),4000),
      'tags',page.rating_tags,'wouldTakeAgain',page.would_take_again
    ) ORDER BY page.review_date DESC NULLS LAST,page.legacy_id DESC)
      FILTER (WHERE page.legacy_id IS NOT NULL),'[]'::jsonb) AS reviews
  FROM page
`;
