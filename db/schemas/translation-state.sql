-- Operational state is separate from historical daily_usage counters.
CREATE SCHEMA IF NOT EXISTS osu_translation;

CREATE TABLE IF NOT EXISTS osu_translation.provider_nodes (
  id text PRIMARY KEY CHECK (id IN ('ollama','dict-chrome-ex','clients5','gtx')),
  display_name text NOT NULL,
  execution text NOT NULL CHECK (execution IN ('server','browser')),
  enabled boolean,
  configured boolean NOT NULL DEFAULT false,
  config_hash text,
  priority integer NOT NULL,
  timeout_ms integer NOT NULL CHECK (timeout_ms BETWEEN 1 AND 8000),
  slow_ms integer NOT NULL CHECK (slow_ms BETWEEN 1 AND 8000),
  cooldown_ms integer NOT NULL CHECK (cooldown_ms BETWEEN 1 AND 300000),
  max_concurrency integer NOT NULL CHECK (max_concurrency BETWEEN 1 AND 8),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,execution),
  CHECK ((execution='server' AND enabled IS NOT NULL) OR (execution='browser' AND enabled IS NULL))
);
INSERT INTO osu_translation.provider_nodes
  (id,display_name,execution,enabled,configured,priority,timeout_ms,slow_ms,cooldown_ms,max_concurrency)
VALUES ('ollama','NAS · Ollama','server',true,false,10,6000,2500,30000,1),
       ('dict-chrome-ex','Google · dict-chrome-ex','browser',NULL,true,20,2500,2000,5000,2),
       ('clients5','Google · clients5','browser',NULL,true,30,2500,2000,5000,2),
       ('gtx','Google · gtx','browser',NULL,true,40,2500,2000,5000,2)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS osu_translation.provider_state (
  provider_id text PRIMARY KEY,
  execution text NOT NULL DEFAULT 'server' CHECK (execution='server'),
  phase text NOT NULL CHECK (phase IN ('unconfigured','disabled','unknown','healthy','degraded','cooldown','recovering')),
  reason text NOT NULL,
  generation integer NOT NULL DEFAULT 0 CHECK (generation >= 0),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  next_retry_at timestamptz,
  probe_id uuid,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_kind text,
  last_http_status integer CHECK (last_http_status BETWEEN 100 AND 599),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (provider_id,execution) REFERENCES osu_translation.provider_nodes(id,execution),
  CHECK (phase NOT IN ('cooldown','degraded') OR next_retry_at IS NOT NULL),
  CHECK (phase <> 'recovering' OR probe_id IS NOT NULL),
  CHECK (next_retry_at IS NULL OR next_retry_at <= updated_at + interval '5 minutes')
);
INSERT INTO osu_translation.provider_state(provider_id,phase,reason)
VALUES ('ollama','unconfigured','not_configured') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS osu_translation.provider_attempts (
  id uuid PRIMARY KEY,
  provider_id text NOT NULL REFERENCES osu_translation.provider_state(provider_id),
  generation integer NOT NULL,
  is_probe boolean NOT NULL,
  target text NOT NULL CHECK (target IN ('en','zh-CN')),
  input_characters integer NOT NULL CHECK (input_characters BETWEEN 0 AND 4000),
  status text NOT NULL CHECK (status IN ('running','succeeded','failed','timed_out','expired','cancelled')),
  reason text,
  http_status integer CHECK (http_status BETWEEN 100 AND 599),
  duration_ms integer CHECK (duration_ms >= 0),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  lease_expires_at timestamptz NOT NULL,
  lease_released_at timestamptz,
  CHECK (lease_expires_at > started_at),
  CHECK ((status='running' AND finished_at IS NULL) OR (status<>'running' AND finished_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS translation_active_leases ON osu_translation.provider_attempts(provider_id,lease_expires_at) WHERE lease_released_at IS NULL;
CREATE INDEX IF NOT EXISTS translation_attempt_history ON osu_translation.provider_attempts(provider_id,started_at DESC);

CREATE TABLE IF NOT EXISTS osu_translation.provider_transitions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id text NOT NULL REFERENCES osu_translation.provider_state(provider_id),
  from_phase text NOT NULL,
  to_phase text NOT NULL,
  reason text NOT NULL,
  generation integer NOT NULL,
  attempt_id uuid REFERENCES osu_translation.provider_attempts(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('request','configuration','operator','expiry')),
  occurred_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS translation_transition_history ON osu_translation.provider_transitions(provider_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS osu_translation.browser_provider_state (
  session_id uuid NOT NULL,
  provider_id text NOT NULL,
  execution text NOT NULL DEFAULT 'browser' CHECK (execution='browser'),
  sequence bigint NOT NULL CHECK (sequence > 0),
  phase text NOT NULL CHECK (phase IN ('unknown','healthy','degraded','cooldown','recovering')),
  reason text NOT NULL,
  consecutive_failures integer NOT NULL CHECK (consecutive_failures BETWEEN 0 AND 100000),
  next_retry_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id,provider_id),
  FOREIGN KEY (provider_id,execution) REFERENCES osu_translation.provider_nodes(id,execution)
);
CREATE INDEX IF NOT EXISTS translation_browser_state_age ON osu_translation.browser_provider_state(observed_at);

COMMENT ON TABLE osu_translation.provider_nodes IS '节点目录与服务端调度配置；凭据仅从环境变量读取。浏览器节点没有全局启停开关。';
COMMENT ON TABLE osu_translation.provider_state IS '服务端当前健康状态。cooldown 到期后允许恢复探测；历史 failure 计数不作为状态。';
COMMENT ON TABLE osu_translation.provider_attempts IS '每次实际 NAS 调用及有限期并发租约。缓存、跳过不算调用。无原文或译文。';
COMMENT ON TABLE osu_translation.provider_transitions IS '当前状态为何变化的审计记录；旧世代的结果不能修改新世代状态。';
COMMENT ON TABLE osu_translation.browser_provider_state IS '匿名页面会话的自报状态，仅供观测；绝不控制服务端或其他用户的 Google 路由。';

CREATE TABLE IF NOT EXISTS osu_translation.usage_daily (
  day date NOT NULL,
  provider text NOT NULL CHECK (provider IN ('ollama','dict-chrome-ex','clients5','gtx','gateway')),
  source text NOT NULL CHECK (source IN ('server','browser_reported','application')),
  target text NOT NULL CHECK (target IN ('en','zh-CN')),
  outcome text NOT NULL CHECK (outcome IN ('success','failure','timeout','busy','circuit','cache','shared','unavailable')),
  requests bigint NOT NULL CHECK (requests >= 0),
  input_characters bigint NOT NULL CHECK (input_characters >= 0),
  total_duration_ms bigint NOT NULL CHECK (total_duration_ms >= 0),
  max_duration_ms integer NOT NULL CHECK (max_duration_ms BETWEEN 0 AND 60000),
  PRIMARY KEY(day,provider,source,target,outcome),
  CHECK ((provider='ollama' AND source='server') OR (provider='gateway' AND source='application') OR
         (provider IN ('dict-chrome-ex','clients5','gtx') AND source='browser_reported'))
);
COMMENT ON TABLE osu_translation.usage_daily IS '新统计，明确区分服务端实际调用、浏览器自报与网站调度决策。与节点当前状态分离。';

CREATE OR REPLACE VIEW osu_translation.v_provider_status AS
SELECT n.id AS provider, n.display_name, n.execution, n.enabled, n.configured,
       CASE WHEN n.execution='browser' THEN 'per_device'
            WHEN s.phase='recovering' AND leases.active_requests=0 THEN 'unknown'
            WHEN s.phase='healthy' AND s.last_success_at <= now()-interval '5 minutes' AND leases.active_requests=0 THEN 'unknown'
            ELSE s.phase END AS health,
       CASE WHEN s.phase='recovering' AND leases.active_requests=0 THEN 'lease_expired'
            WHEN s.phase='healthy' AND s.last_success_at <= now()-interval '5 minutes' AND leases.active_requests=0 THEN 'stale'
            ELSE s.reason END AS reason,
       CASE WHEN n.execution='browser' THEN 'per_device'
            WHEN NOT n.enabled THEN 'disabled'
            WHEN NOT n.configured THEN 'unconfigured'
            WHEN s.next_retry_at > now() THEN 'waiting_retry'
            WHEN leases.active_requests >= n.max_concurrency OR
                 (s.phase <> 'healthy' AND leases.active_requests > 0) OR leases.has_slow_request THEN 'busy'
            WHEN s.phase <> 'healthy' OR s.last_success_at <= now()-interval '5 minutes' THEN 'ready_to_probe'
            ELSE 'ready' END AS availability,
       coalesce(leases.active_requests,0) AS active_requests,
       coalesce(leases.draining_requests,0) AS draining_requests,
       s.consecutive_failures,s.next_retry_at,s.last_success_at,s.last_failure_at,s.last_failure_kind,s.last_http_status,
       n.timeout_ms,n.slow_ms,n.cooldown_ms,n.max_concurrency,s.generation,s.updated_at,
       coalesce(b.sessions,0) AS browser_sessions,
       coalesce(b.healthy_sessions,0) AS browser_healthy_sessions,
       coalesce(b.cooldown_sessions,0) AS browser_cooldown_sessions,
       coalesce(b.ready_to_probe_sessions,0) AS browser_ready_to_probe_sessions,
       b.last_report_at,n.priority
FROM osu_translation.provider_nodes n
LEFT JOIN osu_translation.provider_state s ON s.provider_id=n.id
LEFT JOIN LATERAL (
  SELECT count(*) AS active_requests,
         count(*) FILTER (WHERE a.status <> 'running') AS draining_requests,
         bool_or(a.started_at + n.slow_ms * interval '1 millisecond' <= now()) AS has_slow_request
  FROM osu_translation.provider_attempts a
  WHERE a.provider_id=n.id AND a.generation=s.generation AND a.lease_released_at IS NULL AND a.lease_expires_at > now()
) leases ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS sessions,
         count(*) FILTER (WHERE phase='healthy') AS healthy_sessions,
         count(*) FILTER (WHERE next_retry_at > now()) AS cooldown_sessions,
         count(*) FILTER (WHERE phase<>'healthy' AND coalesce(next_retry_at,now()) <= now()) AS ready_to_probe_sessions,
         max(observed_at) AS last_report_at
  FROM osu_translation.browser_provider_state bs
  WHERE bs.provider_id=n.id AND observed_at > now()-interval '30 minutes'
) b ON true;

CREATE OR REPLACE VIEW osu_translation.v_recent_attempts AS
SELECT provider_id AS provider,id,is_probe,status,reason,http_status,target,input_characters,duration_ms,
       started_at,finished_at,lease_expires_at,lease_released_at,generation
FROM osu_translation.provider_attempts ORDER BY started_at DESC;

CREATE OR REPLACE VIEW osu_translation.v_state_history AS
SELECT provider_id AS provider,from_phase,to_phase,reason,source,attempt_id,generation,occurred_at
FROM osu_translation.provider_transitions ORDER BY occurred_at DESC,id DESC;

CREATE OR REPLACE VIEW osu_translation.v_daily_attempts AS
WITH all_usage AS (
  SELECT day,provider,target,'legacy_unknown'::text AS source,outcome,requests,total_duration_ms FROM osu_translation.daily_usage
  UNION ALL
  SELECT day,provider,target,source,outcome,requests,total_duration_ms FROM osu_translation.usage_daily
)
SELECT day,provider,target,source,
       sum(requests) AS attempts,
       coalesce(sum(requests) FILTER (WHERE outcome='success'),0) AS succeeded,
       coalesce(sum(requests) FILTER (WHERE outcome='failure'),0) AS failed,
       coalesce(sum(requests) FILTER (WHERE outcome='timeout'),0) AS timed_out,
       round(sum(total_duration_ms)::numeric/nullif(sum(requests),0),1) AS average_ms
FROM all_usage WHERE outcome IN ('success','failure','timeout') AND provider <> 'gateway'
GROUP BY day,provider,target,source;

CREATE OR REPLACE VIEW osu_translation.v_daily_routing AS
SELECT day,provider,target,outcome AS decision,requests AS decisions,'legacy_unknown'::text AS source
FROM osu_translation.daily_usage WHERE outcome IN ('busy','circuit','cache','shared','unavailable')
UNION ALL
SELECT day,provider,target,outcome,requests,source
FROM osu_translation.usage_daily WHERE outcome IN ('busy','circuit','cache','shared','unavailable');
COMMENT ON TABLE osu_translation.daily_usage IS '旧版历史汇总，不再由新程序写入。来源无法追溯的数据在视图中标为 legacy_unknown，不能推断节点当前状态。';
