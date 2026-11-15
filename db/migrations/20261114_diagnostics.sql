CREATE TABLE osu_user.diagnostic_report (
  id uuid PRIMARY KEY,
  actor_digest text NOT NULL,
  payload_digest text NOT NULL,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  observed_context jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX diagnostic_report_created ON osu_user.diagnostic_report(created_at DESC,id DESC);
