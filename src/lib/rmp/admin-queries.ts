import { rmpAdminTable } from "./admin-namespace.ts";
export function adminRowsSQL(env: NodeJS.ProcessEnv = process.env) {
  return `WITH records AS (
    SELECT coalesce(m.professor_id,d.professor_id) professor_id,coalesce(m.campus_code,d.campus_code) campus_code,
      coalesce(m.raw_course_token,d.raw_course_token) raw_course_token,m.course_key automatic_course_key,
      coalesce(m.state,'stale') automatic_state,coalesce(m.reason,'source_missing') reason,
      coalesce(m.candidates,'[]'::jsonb) candidates,coalesce(m.evidence,'{}'::jsonb) evidence,
      d.action,d.course_key manual_course_key,d.reason manual_reason,d.evidence_urls,coalesce(d.version,0) version,
      coalesce(d.updated_at,m.updated_at)::text updated_at
    FROM osu_rmp.course_identity_match m FULL JOIN ${rmpAdminTable("course_decision", env)} d
      USING(professor_id,campus_code,raw_course_token)
  ), rows AS (
    SELECT r.*,p.first_name,p.last_name,p.department,i.name_dot_number,
      CASE r.action WHEN 'bind' THEN 'bound' WHEN 'unbind' THEN 'unbound' WHEN 'reject' THEN 'rejected' ELSE automatic_state END state,
      CASE WHEN r.action='bind' THEN manual_course_key WHEN r.action IS NULL THEN automatic_course_key END course_key,
      coalesce(i.state,'missing') identity_state
    FROM records r JOIN osu_rmp.professor p ON p.legacy_id=r.professor_id
    LEFT JOIN osu_rmp.professor_identity_map i ON i.professor_id=r.professor_id AND i.state='accepted'
  )`;
}
export const adminRowFields = `professor_id::text AS "professorId",concat_ws(' ',first_name,last_name) AS name,
  coalesce(department,'') department,campus_code campus,raw_course_token token,course_key AS "courseKey",state,reason,candidates,evidence,
  version,manual_reason AS "manualReason",coalesce(evidence_urls,'[]'::jsonb) AS "evidenceUrls",updated_at AS "updatedAt",
  name_dot_number username,identity_state AS "identityState"`;
export const adminSourceFingerprint = (alias: string) =>
  `encode(sha256(convert_to(
    coalesce((SELECT jsonb_build_array(p.first_name,p.last_name,p.department,p.course_codes,p.active,p.updated_at)::text
      FROM osu_rmp.professor p WHERE p.legacy_id=${alias}.professor_id),'')||'|'||
    coalesce((SELECT jsonb_agg(to_jsonb(im) ORDER BY im.name_dot_number)::text FROM osu_rmp.professor_identity_map im
      WHERE im.professor_id=${alias}.professor_id AND im.state='accepted'),'[]')||'|'||
    coalesce((SELECT jsonb_agg(jsonb_build_array(ic.name_dot_number,ic.source,ic.source_record_key,ic.campus_code,
        ic.course_key,ic.subject,ic.catalog_number,ic.latest_term,ic.active,ic.last_seen_at)
        ORDER BY ic.name_dot_number,ic.source,ic.source_record_key)::text
      FROM osu_rmp.instructor_course ic WHERE ic.source IN ('official_catalog','official_evaluation')
        AND EXISTS(SELECT 1 FROM osu_rmp.professor_identity_map im WHERE im.professor_id=${alias}.professor_id
          AND im.state='accepted' AND im.name_dot_number=ic.name_dot_number)),'[]')||'|'||
    coalesce((SELECT string_agg(rv.legacy_id::text||':'||coalesce(rv.updated_at::text,'')||':'||rv.active::text,',' ORDER BY rv.legacy_id)
      FROM osu_rmp.review rv WHERE rv.professor_id=${alias}.professor_id
        AND osu_rmp.review_course_token(rv.class_name)=${alias}.raw_course_token),''),'UTF8')),'hex')`;
export function adminListSQL() {
  return `${adminRowsSQL()}, matching AS (
    SELECT * FROM rows r WHERE ($1='' OR concat_ws(' ',raw_course_token,course_key,candidates::text) ILIKE '%'||replace($1,' ','')||'%' ESCAPE '\\'
      OR course_key=ANY($8::text[])
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(candidates) candidate WHERE candidate.value=ANY($8::text[])))
      AND ($2='' OR concat_ws(' ',first_name,last_name,name_dot_number,professor_id::text) ILIKE '%'||$2||'%' ESCAPE '\\')
      AND ($3='all' OR state=$3) AND ($4='ALL' OR campus_code=$4)
      AND ($5='' OR concat_ws(' ',department,evidence::text,manual_reason) ILIKE '%'||$5||'%' ESCAPE '\\'
        OR EXISTS(SELECT 1 FROM osu_rmp.review rv WHERE rv.professor_id=r.professor_id
          AND osu_rmp.review_course_token(rv.class_name)=r.raw_course_token AND rv.comment ILIKE '%'||$5||'%' ESCAPE '\\'))
  ), page AS (SELECT * FROM matching ORDER BY professor_id,campus_code,raw_course_token LIMIT $6 OFFSET $7)
  SELECT (SELECT count(*)::int FROM matching) total,coalesce(jsonb_agg(to_jsonb(items) ORDER BY "professorId"::bigint,campus,token),'[]'::jsonb) items
  FROM (SELECT ${adminRowFields},(SELECT count(*)::int FROM osu_rmp.review rv WHERE rv.professor_id=page.professor_id AND rv.active
    AND osu_rmp.review_course_token(rv.class_name)=page.raw_course_token) AS "reviewCount",${adminSourceFingerprint("page")} AS "sourceFingerprint" FROM page) items`;
}
