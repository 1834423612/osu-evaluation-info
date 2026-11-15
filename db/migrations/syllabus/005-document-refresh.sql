-- Mutable refresh checkpoints are separate from permanent document versions and index observations.
CREATE TABLE IF NOT EXISTS osu_syllabus.document_checks (
  code text PRIMARY KEY REFERENCES osu_syllabus.entries(code),
  entry_data jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('saved','uploaded','missing','restricted')),
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS syllabus_document_check_age ON osu_syllabus.document_checks(checked_at,code);
-- Earlier collectors fetched every document; index timestamps are a conservative lower bound.
INSERT INTO osu_syllabus.document_checks(code,entry_data,status,checked_at)
SELECT DISTINCT ON(o.code) o.code,o.data,o.document_status,
  CASE WHEN o.document_status IN ('saved','uploaded') THEN coalesce(v.checked_at,o.fetched_at) ELSE o.fetched_at END
FROM osu_syllabus.entry_observations o JOIN osu_syllabus.entries e USING(code)
LEFT JOIN LATERAL(SELECT max(checked_at) checked_at FROM osu_syllabus.document_versions d WHERE d.code=o.code) v ON true
WHERE o.document_status IN ('saved','uploaded','missing','restricted')
ORDER BY o.code,o.fetched_at DESC
ON CONFLICT(code) DO NOTHING;
INSERT INTO osu_syllabus.schema_versions(version) VALUES(5) ON CONFLICT DO NOTHING;
