-- Fixed daily dimensions: at most 5 * 2 * 8 * 90 = 7,200 rows after retention cleanup.
CREATE SCHEMA IF NOT EXISTS osu_translation;

CREATE TABLE IF NOT EXISTS osu_translation.daily_usage (
  day date NOT NULL,
  provider text NOT NULL CHECK (provider IN ('ollama', 'dict-chrome-ex', 'clients5', 'gtx', 'gateway')),
  target text NOT NULL CHECK (target IN ('en', 'zh-CN')),
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure', 'timeout', 'busy', 'circuit', 'cache', 'shared', 'unavailable')),
  requests bigint NOT NULL CHECK (requests >= 0),
  input_characters bigint NOT NULL CHECK (input_characters >= 0),
  total_duration_ms bigint NOT NULL CHECK (total_duration_ms >= 0),
  max_duration_ms integer NOT NULL CHECK (max_duration_ms BETWEEN 0 AND 60000),
  PRIMARY KEY (day, provider, target, outcome)
);
