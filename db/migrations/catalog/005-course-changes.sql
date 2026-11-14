-- Append-only changes between complete, published snapshots of the same term.
CREATE TABLE IF NOT EXISTS osu_catalog.change_batches (
  run_id uuid NOT NULL REFERENCES osu_catalog.snapshot_versions(run_id),
  term_code text NOT NULL,
  previous_run_id uuid REFERENCES osu_catalog.snapshot_versions(run_id),
  observed_at timestamptz NOT NULL,
  PRIMARY KEY(run_id,term_code)
);
CREATE TABLE IF NOT EXISTS osu_catalog.course_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL,
  term_code text NOT NULL,
  course_id text NOT NULL,
  offering_number text NOT NULL,
  campus_code text NOT NULL,
  subject text NOT NULL,
  catalog_number text NOT NULL,
  title text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('added','restored','changed','removed')),
  fields text[] NOT NULL,
  before_data jsonb,
  after_data jsonb,
  observed_at timestamptz NOT NULL,
  FOREIGN KEY(run_id,term_code) REFERENCES osu_catalog.change_batches(run_id,term_code),
  UNIQUE(run_id,term_code,course_id,offering_number,campus_code)
);
CREATE INDEX IF NOT EXISTS course_changes_feed ON osu_catalog.course_changes(term_code,observed_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS course_changes_campus ON osu_catalog.course_changes(term_code,campus_code,observed_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS change_batches_feed ON osu_catalog.change_batches(term_code,observed_at DESC);

-- Only meaningful catalog fields; seats, internal IDs, fetch times and array order are excluded.
CREATE OR REPLACE FUNCTION osu_catalog.course_change_state(run uuid,term text)
RETURNS TABLE(course_id text,offering_number text,campus_code text,subject text,catalog_number text,title text,facts jsonb)
LANGUAGE sql STABLE SET jit=off AS $$
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
 FROM osu_catalog.section_snapshots s WHERE s.last_seen_run=run AND s.term_code=term
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
    CASE WHEN jsonb_typeof(c.data->'courseAttributes')='array' THEN c.data->'courseAttributes' ELSE '[]'::jsonb END) a),'[]'::jsonb)) || coalesce(g.facts,'{}'::jsonb)
FROM osu_catalog.course_snapshots c LEFT JOIN grouped g USING(course_id,offering_number,campus_code)
WHERE c.last_seen_run=run AND c.term_code=term
$$;

CREATE OR REPLACE FUNCTION osu_catalog.course_change_fields(a jsonb,b jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(array_agg(key ORDER BY key),'{}'::text[]) FROM (
   SELECT key FROM unnest(ARRAY['code','title','description','credits','level','grading','attributes','sections']) key
   WHERE a->key IS DISTINCT FROM b->key
   UNION ALL
   SELECT k.field FROM unnest(ARRAY['teachers','schedule','locations','delivery']) k(field)
   WHERE (SELECT coalesce(jsonb_object_agg(x.key,x.value),'{}'::jsonb) FROM jsonb_each(coalesce(a->k.field,'{}'::jsonb)) x WHERE b->k.field ? x.key)
     IS DISTINCT FROM
     (SELECT coalesce(jsonb_object_agg(x.key,x.value),'{}'::jsonb) FROM jsonb_each(coalesce(b->k.field,'{}'::jsonb)) x WHERE a->k.field ? x.key)
 ) differences
$$;

CREATE OR REPLACE FUNCTION osu_catalog.capture_course_changes(target uuid,only_term text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE published timestamptz; t text; prev uuid; n integer; total integer:=0;
BEGIN
 SELECT v.published_at INTO published FROM osu_catalog.snapshot_versions v JOIN osu_catalog.sync_runs r ON r.id=v.run_id
 WHERE v.run_id=target AND v.published_at IS NOT NULL AND r.status='complete';
 IF published IS NULL THEN RAISE EXCEPTION 'Changes require a complete published snapshot'; END IF;
 FOR t IN SELECT x.value FROM osu_catalog.sync_runs r, jsonb_array_elements_text(r.terms) x(value) WHERE r.id=target AND (only_term IS NULL OR x.value=only_term) LOOP
  IF EXISTS(SELECT 1 FROM osu_catalog.change_batches b WHERE b.run_id=target AND b.term_code=t) THEN CONTINUE; END IF;
  SELECT v.run_id INTO prev FROM osu_catalog.snapshot_versions v JOIN osu_catalog.sync_runs r ON r.id=v.run_id
    WHERE v.published_at IS NOT NULL AND r.status='complete' AND r.terms ? t AND (v.published_at,v.run_id)<(published,target)
    ORDER BY v.published_at DESC,v.run_id DESC LIMIT 1;
  INSERT INTO osu_catalog.change_batches VALUES(target,t,prev,published);
  IF prev IS NULL THEN CONTINUE; END IF;
  WITH old AS MATERIALIZED (SELECT * FROM osu_catalog.course_change_state(prev,t)),
       fresh AS MATERIALIZED (SELECT * FROM osu_catalog.course_change_state(target,t)),
       delta AS (
    SELECT coalesce(b.course_id,a.course_id) course_id,coalesce(b.offering_number,a.offering_number) offering_number,
      coalesce(b.campus_code,a.campus_code) campus_code,coalesce(b.subject,a.subject) subject,
      coalesce(b.catalog_number,a.catalog_number) catalog_number,coalesce(b.title,a.title) title,
      a.facts before_data,b.facts after_data,
      CASE WHEN b.course_id IS NULL THEN 'removed' WHEN a.course_id IS NOT NULL THEN 'changed'
        WHEN EXISTS(SELECT 1 FROM osu_catalog.course_snapshots h JOIN osu_catalog.snapshot_versions v ON v.run_id=h.last_seen_run
          JOIN osu_catalog.sync_runs r ON r.id=v.run_id WHERE v.published_at IS NOT NULL AND r.status='complete'
          AND (v.published_at,v.run_id)<(published,target) AND h.term_code=t AND h.course_id=b.course_id
          AND h.offering_number=b.offering_number AND h.campus_code=b.campus_code) THEN 'restored' ELSE 'added' END kind,
      CASE WHEN a.course_id IS NULL OR b.course_id IS NULL THEN ARRAY['sections'] ELSE osu_catalog.course_change_fields(a.facts,b.facts) END fields
    FROM old a FULL JOIN fresh b USING(course_id,offering_number,campus_code)
    WHERE a.facts IS DISTINCT FROM b.facts
  )
  INSERT INTO osu_catalog.course_changes(run_id,term_code,course_id,offering_number,campus_code,subject,catalog_number,title,kind,fields,before_data,after_data,observed_at)
  SELECT target,t,d.course_id,d.offering_number,d.campus_code,d.subject,d.catalog_number,d.title,d.kind,d.fields,d.before_data,d.after_data,published
  FROM delta d WHERE d.kind<>'changed' OR cardinality(d.fields)>0;
  GET DIAGNOSTICS n=ROW_COUNT; total:=total+n;
 END LOOP;
 RETURN total;
END $$;

CREATE OR REPLACE FUNCTION osu_catalog.capture_course_changes(target uuid) RETURNS integer
LANGUAGE sql VOLATILE AS $$ SELECT osu_catalog.capture_course_changes(target,NULL) $$;

CREATE OR REPLACE FUNCTION osu_catalog.protect_course_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published course changes are append-only'; END $$;
CREATE TRIGGER course_changes_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON osu_catalog.course_changes FOR EACH STATEMENT EXECUTE FUNCTION osu_catalog.protect_course_changes();
CREATE TRIGGER change_batches_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON osu_catalog.change_batches FOR EACH STATEMENT EXECUTE FUNCTION osu_catalog.protect_course_changes();
