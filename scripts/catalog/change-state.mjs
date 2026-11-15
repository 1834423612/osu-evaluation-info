// Canonical fields match migration 005; bounded source filtering happens before JSON expansion.
const SQL = `
WITH sections AS (
 SELECT s.course_id,s.offering_number,s.campus_code,s.class_number,
  jsonb_build_array(s.data->>'section',s.data->>'component',s.data->>'type',s.data->>'status',s.data->>'cancelDate',s.data->>'sessionCode') AS section,
  coalesce((SELECT jsonb_agg(DISTINCT x.v ORDER BY x.v) FROM (
    SELECT jsonb_build_array(lower(coalesce(nullif(i->>'email',''),i->>'displayName','')),coalesce(i->>'role','')) v
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.data->'meetings')='array' THEN s.data->'meetings' ELSE '[]'::jsonb END) m,
      jsonb_array_elements(CASE WHEN jsonb_typeof(m->'instructors')='array' THEN m->'instructors' ELSE '[]'::jsonb END) i
  ) x),'[]'::jsonb) AS teachers,
  jsonb_build_array(s.data->>'startDate',s.data->>'endDate',s.data->>'meetingDays',
    coalesce((SELECT jsonb_agg(DISTINCT x.v ORDER BY x.v) FROM (
      SELECT jsonb_build_array(m->>'startDate',m->>'endDate',m->>'startTime',m->>'endTime',
        coalesce(m->'monday','false'::jsonb),coalesce(m->'tuesday','false'::jsonb),coalesce(m->'wednesday','false'::jsonb),
        coalesce(m->'thursday','false'::jsonb),coalesce(m->'friday','false'::jsonb),coalesce(m->'saturday','false'::jsonb),coalesce(m->'sunday','false'::jsonb)) v
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.data->'meetings')='array' THEN s.data->'meetings' ELSE '[]'::jsonb END) m
    ) x),'[]'::jsonb)) AS schedule,
  jsonb_build_array(s.data->>'location',coalesce((SELECT jsonb_agg(DISTINCT x.v ORDER BY x.v) FROM (
    SELECT jsonb_build_array(m->>'facilityId',m->>'buildingCode',m->>'room') v
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.data->'meetings')='array' THEN s.data->'meetings' ELSE '[]'::jsonb END) m
  ) x),'[]'::jsonb)) AS locations,
  to_jsonb(coalesce(s.data->>'instructionMode','')) AS delivery
 FROM osu_catalog.section_snapshots s WHERE s.last_seen_run=run AND s.term_code=term AND s.course_id=ANY(ids)
), grouped AS (
 SELECT s.course_id,s.offering_number,s.campus_code,
  jsonb_build_object('sections',jsonb_object_agg(s.class_number,s.section),
    'teachers',jsonb_object_agg(s.class_number,s.teachers),'schedule',jsonb_object_agg(s.class_number,s.schedule),
    'locations',jsonb_object_agg(s.class_number,s.locations),'delivery',jsonb_object_agg(s.class_number,s.delivery)) facts
 FROM sections s GROUP BY s.course_id,s.offering_number,s.campus_code
)
SELECT c.course_id,c.offering_number,c.campus_code,c.subject,c.catalog_number,c.title,
 jsonb_build_object('code',jsonb_build_array(c.subject,c.catalog_number),'title',c.title,
  'description',trim(regexp_replace(c.description,'[[:space:]]+',' ','g')),
  'credits',jsonb_build_array(c.data->>'minUnits',c.data->>'maxUnits'),
  'level',c.data->>'academicCareer','grading',c.data->>'grading',
  'attributes',coalesce((SELECT jsonb_agg(DISTINCT a ORDER BY a) FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.data->'courseAttributes')='array' THEN c.data->'courseAttributes' ELSE '[]'::jsonb END) a),'[]'::jsonb)) || coalesce(g.facts,'{}'::jsonb) AS facts
FROM osu_catalog.course_snapshots c LEFT JOIN grouped g USING(course_id,offering_number,campus_code)
WHERE c.last_seen_run=run AND c.term_code=term AND c.course_id=ANY(ids)
`;
export function courseChangeStateSql(run, term, ids) {
  for (const value of [run, term, ids])
    if (!/^\$[1-9][0-9]*$/.test(value)) throw Error("Invalid SQL parameter");
  return SQL.replace(/\brun\b/g, () => run)
    .replace(/\bterm\b/g, () => term)
    .replace(/\bids\b/g, () => ids + "::text[]");
}
