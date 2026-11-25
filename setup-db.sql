-- =====================================================================
-- Setu — canonical database schema + seed (single source of truth)
-- PostgreSQL + pgvector (Supabase). Idempotent: safe to re-run.
-- Setup: run this file in the Supabase SQL Editor, then
--        `npm run seed` from server/ to load pgvector embeddings.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------- Types (idempotent: CREATE TYPE has no IF NOT EXISTS) ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'monitor_type') THEN
    CREATE TYPE monitor_type AS ENUM ('website', 'api');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'monitor_status') THEN
    CREATE TYPE monitor_status AS ENUM ('active', 'paused');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_status') THEN
    CREATE TYPE incident_status AS ENUM ('open', 'diagnosing', 'recovering', 'resolved', 'failed');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recovery_action_status') THEN
    CREATE TYPE recovery_action_status AS ENUM ('pending', 'approved', 'rejected', 'executed', 'verified', 'failed');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'change_type') THEN
    CREATE TYPE change_type AS ENUM ('renamed', 'removed', 'type_changed');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_type') THEN
    CREATE TYPE incident_type AS ENUM ('drift', 'latency', 'error', 'dependency');
  END IF;
END $$;

-- ---------- Session store (connect-pg-simple) ----------
CREATE TABLE IF NOT EXISTS session (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL,
  PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

-- ---------- Core tables ----------
CREATE TABLE IF NOT EXISTS "User" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url VARCHAR(500),
  provider VARCHAR(50),
  provider_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS Monitor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES "User"(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type monitor_type NOT NULL DEFAULT 'website',
  url VARCHAR(500) NOT NULL,
  method VARCHAR(10) DEFAULT 'GET',
  interval_sec INTEGER DEFAULT 60,
  timeout_ms INTEGER DEFAULT 5000,
  retries INTEGER DEFAULT 0,
  cache_enabled BOOLEAN DEFAULT false,
  status monitor_status DEFAULT 'active',
  health_score INTEGER DEFAULT 100,
  last_probed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS Probe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID REFERENCES Monitor(id) ON DELETE CASCADE,
  at TIMESTAMP DEFAULT NOW(),
  ok BOOLEAN DEFAULT true,
  status_code INTEGER,
  latency_ms INTEGER,
  schema_ok BOOLEAN DEFAULT true,
  error TEXT,
  dns_ok BOOLEAN DEFAULT true,
  ssl_days_left INTEGER
);
CREATE INDEX IF NOT EXISTS idx_probe_monitor_at ON Probe (monitor_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_probe_at ON Probe (at DESC);

CREATE TABLE IF NOT EXISTS Incident (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID REFERENCES Monitor(id) ON DELETE CASCADE,
  type incident_type NOT NULL,
  severity VARCHAR(50),
  title VARCHAR(500) NOT NULL,
  probable_cause TEXT,
  status incident_status DEFAULT 'open',
  diagnosis JSONB,
  opened_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_incident_monitor_status ON Incident (monitor_id, status);

CREATE TABLE IF NOT EXISTS IncidentEvent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES Incident(id) ON DELETE CASCADE,
  at TIMESTAMP DEFAULT NOW(),
  kind VARCHAR(50) NOT NULL,
  actor VARCHAR(255),
  payload JSONB
);

CREATE TABLE IF NOT EXISTS RecoveryAction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES Incident(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  status recovery_action_status DEFAULT 'pending',
  proposed_by VARCHAR(255),
  approved_by VARCHAR(255),
  executed_at TIMESTAMP,
  post_check_ok BOOLEAN
);

CREATE TABLE IF NOT EXISTS DependencyCheck (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID REFERENCES Monitor(id) ON DELETE CASCADE,
  at TIMESTAMP DEFAULT NOW(),
  dns_ok BOOLEAN DEFAULT true,
  ssl_issuer VARCHAR(255),
  ssl_expires_at TIMESTAMP,
  ssl_days_left INTEGER,
  upstream_hosts JSONB DEFAULT '{}'::jsonb,
  rate_limited BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS Recommendation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID REFERENCES Monitor(id) ON DELETE SET NULL,
  user_id UUID REFERENCES "User"(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  why TEXT NOT NULL,
  action JSONB DEFAULT '{}'::jsonb,
  source VARCHAR(50) DEFAULT 'telemetry',
  status VARCHAR(50) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW()
);
-- Upgrade older DBs: recommendations were global rows shared by every account.
ALTER TABLE Recommendation ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES "User"(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_recommendation_user ON Recommendation (user_id);
UPDATE Recommendation r SET user_id = m.user_id
  FROM Monitor m WHERE r.monitor_id = m.id AND r.user_id IS NULL;
UPDATE Recommendation SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;

CREATE TABLE IF NOT EXISTS SchemaVersion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID REFERENCES Monitor(id) ON DELETE CASCADE,
  version VARCHAR(100) NOT NULL,
  schema_json JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'expected',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ChangeEvent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID REFERENCES Monitor(id) ON DELETE CASCADE,
  old_schema_id UUID REFERENCES SchemaVersion(id),
  new_schema_id UUID REFERENCES SchemaVersion(id),
  change_type change_type NOT NULL,
  detected_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS MappingFix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_id UUID REFERENCES ChangeEvent(id),
  fix_code TEXT,
  proposed_by VARCHAR(255),
  approved_by VARCHAR(255),
  approved_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS AuditLog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor VARCHAR(255),
  timestamp TIMESTAMP DEFAULT NOW(),
  payload JSONB
);
-- Audit rows belong to the owner of the entity they describe (history page is per user).
ALTER TABLE AuditLog ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES "User"(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_auditlog_user ON AuditLog (user_id);
UPDATE AuditLog a SET user_id = m.user_id
  FROM incident i JOIN Monitor m ON m.id = i.monitor_id
  WHERE a.entity_type = 'incident' AND a.entity_id = i.id AND a.user_id IS NULL;
UPDATE AuditLog a SET user_id = m.user_id
  FROM RecoveryAction ra
  JOIN incident i ON i.id = ra.incident_id JOIN Monitor m ON m.id = i.monitor_id
  WHERE a.entity_type = 'recovery_action' AND a.entity_id = ra.id AND a.user_id IS NULL;
UPDATE AuditLog a SET user_id = m.user_id
  FROM SchemaVersion sv JOIN Monitor m ON m.id = sv.monitor_id
  WHERE a.entity_type = 'schema_version' AND a.entity_id = sv.id AND a.user_id IS NULL;
UPDATE AuditLog SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;

-- pgvector embeddings (384-dim; server seeds them via npm run seed)
CREATE TABLE IF NOT EXISTS Embedding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(50) NOT NULL,
  ref_id UUID,
  content TEXT,
  vector vector(384)
);
CREATE INDEX IF NOT EXISTS idx_embedding_vector ON Embedding
  USING hnsw (vector vector_cosine_ops);

CREATE TABLE IF NOT EXISTS Setting (
  key VARCHAR(100) NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id UUID REFERENCES "User"(id) ON DELETE CASCADE
);
-- Upgrade older DBs: settings were one global row per key; scope them per user.
ALTER TABLE Setting ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE Setting DROP CONSTRAINT IF EXISTS setting_pkey;
UPDATE Setting SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_setting_key_user ON Setting (key, user_id);

-- =====================================================================
-- Seed data — context.md §7 canonical demo story (idempotent by id)
-- =====================================================================

-- Demo user (Sarah Chen)
INSERT INTO "User" (id, email, name, avatar_url, provider, provider_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'sarah.chen@example.com', 'Sarah Chen', NULL, 'google', 'GOOGLE123')
ON CONFLICT (id) DO NOTHING;

-- ---------- Settings defaults (demo account; other accounts inherit code defaults) ----------
INSERT INTO Setting (key, value, user_id) VALUES
  ('latencyThresholdMs', '1000'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('consecutiveSlow', '3'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('maxRecoveryPerHour', '3'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('requireApproval', 'true'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('dryRunDefault', 'true'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('probeIntervalDefault', '60'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('ragEnabled', 'true'::jsonb, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (key, user_id) DO NOTHING;

-- 4 monitors (context.md §5.3 / §7)
INSERT INTO Monitor (id, user_id, name, type, url, method, interval_sec, timeout_ms, retries, cache_enabled, status, health_score, last_probed_at) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'REST Countries API', 'api', 'https://restcountries.com/v3.1/all?fields=name,capital,currencies,region,population,area,flag', 'GET', 60, 5000, 0, false, 'active', 71, NOW() - INTERVAL '18 seconds'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'JSONPlaceholder', 'api', 'https://jsonplaceholder.typicode.com', 'GET', 60, 5000, 0, false, 'active', 82, NOW() - INTERVAL '34 seconds'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Open-Meteo Site', 'website', 'https://open-meteo.com', 'GET', 300, 5000, 0, false, 'active', 99, NOW() - INTERVAL '12 seconds'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Wikipedia', 'website', 'https://www.wikipedia.org', 'GET', 300, 5000, 0, false, 'active', 98, NOW() - INTERVAL '9 seconds')
ON CONFLICT (id) DO NOTHING;

-- Probes: 100 per monitor over the last 24h, deterministic ids (re-runnable).
-- JSONPlaceholder's 3 newest probes are the 1,480ms spike cluster (§5.3/§5.7).
INSERT INTO Probe (id, monitor_id, at, ok, status_code, latency_ms, schema_ok, error, dns_ok, ssl_days_left)
SELECT
  md5('setu-probe-002-' || s)::uuid,
  '00000000-0000-0000-0000-000000000002',
  NOW() - make_interval(mins => (100 - s) * 14 + (s % 3)),
  true, 200,
  CASE WHEN s = 100 THEN 210 ELSE (150 + floor(random() * 250))::int END,
  true, NULL, true, 60 + (s % 30)
FROM generate_series(1, 100) s
ON CONFLICT (id) DO NOTHING;

INSERT INTO Probe (id, monitor_id, at, ok, status_code, latency_ms, schema_ok, error, dns_ok, ssl_days_left)
SELECT
  md5('setu-probe-003-' || s)::uuid,
  '00000000-0000-0000-0000-000000000003',
  NOW() - make_interval(mins => (100 - s) * 14 + (s % 4)),
  true, 200,
  CASE
    WHEN s >= 98 THEN (1440 + (s - 98) * 20 + floor(random() * 40))::int  -- spike cluster
    WHEN s IN (71, 72, 73) THEN (1050 + floor(random() * 300))::int       -- earlier breach
    ELSE (300 + floor(random() * 600))::int
  END,
  true, NULL, true, 60 + (s % 30)
FROM generate_series(1, 100) s
ON CONFLICT (id) DO NOTHING;

INSERT INTO Probe (id, monitor_id, at, ok, status_code, latency_ms, schema_ok, error, dns_ok, ssl_days_left)
SELECT
  md5('setu-probe-004-' || s)::uuid,
  '00000000-0000-0000-0000-000000000004',
  NOW() - make_interval(mins => (100 - s) * 14 + (s % 5)),
  true, 200, (180 + floor(random() * 120))::int, true, NULL, true, 84
FROM generate_series(1, 100) s
ON CONFLICT (id) DO NOTHING;

INSERT INTO Probe (id, monitor_id, at, ok, status_code, latency_ms, schema_ok, error, dns_ok, ssl_days_left)
SELECT
  md5('setu-probe-005-' || s)::uuid,
  '00000000-0000-0000-0000-000000000005',
  NOW() - make_interval(mins => (100 - s) * 14 + (s % 6)),
  true, 200, (140 + floor(random() * 110))::int, true, NULL, true, 84
FROM generate_series(1, 100) s
ON CONFLICT (id) DO NOTHING;

-- 4 incidents (context.md §5.5) with story timestamps
INSERT INTO Incident (id, monitor_id, type, severity, title, probable_cause, status, diagnosis, opened_at, closed_at) VALUES
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002', 'drift', 'high',
   'Schema drift detected on REST Countries API',
   'Upstream renamed capital field and removed flag',
   'open',
   '{"summary":"Upstream renamed `capital` → `capital_city` and removed `flag`; `population` type changed number→string. Correlated with: provider changelog not published; 420 req/min affected. Confidence 94% (RAG: 8 similar past incidents).","confidence":0.94,"ragUsed":8,"llm":true,"rules":{"type":"drift","rule":"Upstream API schema change — the response contract no longer matches the expected schema."}}'::jsonb,
   NOW() - INTERVAL '2 minutes', NULL),
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003', 'latency', 'medium',
   'High latency on JSONPlaceholder',
   '3 consecutive calls >1000ms',
   'recovering',
   '{"summary":"Third-party slowness — JSONPlaceholder returned 1,480ms on 3 consecutive calls, above the 1,000ms threshold. Retry with backoff recovered 3 of 5 similar incidents (RAG ×5).","confidence":0.9,"ragUsed":5,"llm":true,"rules":{"type":"latency","rule":"Third-party slowness or payload growth — repeated calls exceeded the latency threshold."}}'::jsonb,
   NOW() - INTERVAL '1 hour', NULL),
  ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000002', 'dependency', 'low',
   'SSL certificate expiring on REST Countries API',
   'SSL cert expires in 12 days',
   'open',
   NULL,
   NOW() - INTERVAL '26 hours', NULL),
  ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000004', 'error', 'medium',
   '5xx error burst on Open-Meteo',
   '5xx burst (7 requests/5min)',
   'resolved',
   '{"summary":"Upstream 5xx burst (7 requests/5min) on open-meteo.com; recovered by retry policy.","confidence":0.88,"ragUsed":3,"llm":false,"rules":{"type":"error","rule":"Upstream 5xx burst — the target returned server errors in a short window."}}'::jsonb,
   NOW() - INTERVAL '30 hours', NOW() - INTERVAL '30 hours' + INTERVAL '4.2 minutes')
ON CONFLICT (id) DO NOTHING;

-- Incident events
INSERT INTO IncidentEvent (id, incident_id, at, kind, actor, payload) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000006', NOW() - INTERVAL '2 minutes', 'detected', 'system', '{"source":"schema-diff"}'::jsonb),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000006', NOW() - INTERVAL '2 minutes', 'diagnosis', 'llm', '{"confidence":0.94,"ragUsed":8,"llm":true}'::jsonb),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000007', NOW() - INTERVAL '1 hour', 'detected', 'system', '{"source":"probe"}'::jsonb),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000007', NOW() - INTERVAL '58 minutes', 'diagnosis', 'llm', '{"confidence":0.9,"ragUsed":5,"llm":true}'::jsonb),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000008', NOW() - INTERVAL '26 hours', 'detected', 'system', '{"source":"dependency-checks","sslDaysLeft":12}'::jsonb),
  ('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000009', NOW() - INTERVAL '30 hours', 'detected', 'system', '{"source":"probe"}'::jsonb),
  ('00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000009', NOW() - INTERVAL '30 hours' + INTERVAL '4 minutes', 'executed', 'system', '{"kind":"retry"}'::jsonb),
  ('00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000009', NOW() - INTERVAL '30 hours' + INTERVAL '4.2 minutes', 'postcheck', 'system', '{"passed":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Dependency checks (restcountries.com SSL expires in 12 days — §5.8)
INSERT INTO DependencyCheck (id, monitor_id, at, dns_ok, ssl_issuer, ssl_expires_at, ssl_days_left, upstream_hosts, rate_limited) VALUES
  ('00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000002', NOW(), true, 'GeoTrust Inc.', NOW() + INTERVAL '12 days', 12, '{"hosts":["restcountries.com"],"addresses":["104.21.30.1"]}'::jsonb, false),
  ('00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000003', NOW(), true, 'Let''s Encrypt', NOW() + INTERVAL '84 days', 84, '{"hosts":["jsonplaceholder.typicode.com"],"addresses":["104.21.17.68"]}'::jsonb, false),
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000004', NOW(), true, 'DigiCert', NOW() + INTERVAL '84 days', 84, '{"hosts":["open-meteo.com"],"addresses":["188.114.96.1"]}'::jsonb, false),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000005', NOW(), true, 'DigiCert', NOW() + INTERVAL '84 days', 84, '{"hosts":["www.wikipedia.org"],"addresses":["208.80.154.224"]}'::jsonb, false)
ON CONFLICT (id) DO NOTHING;

-- Recommendations (context.md §5.9) — owned by the demo account
INSERT INTO Recommendation (id, monitor_id, user_id, title, why, action, source, status) VALUES
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Add retry with exponential backoff to JSONPlaceholder monitor', '12 slow calls this week; 3 recovered by retry in similar past incidents (RAG ×5)', '{"kind":"retry","retries":2,"backoff":"exponential"}'::jsonb, 'telemetry', 'open'),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Bake capital_city remap into the transform permanently', '2nd drift this month on the same field', '{"kind":"transform","fix":"capital→capital_city"}'::jsonb, 'rag', 'open'),
  ('00000000-0000-0000-0000-000000000024', NULL, '00000000-0000-0000-0000-000000000001', 'Extend website probe interval to 2 minutes', '0 anomalies on website monitors in 7 days; cuts noise', '{"kind":"interval","minutes":120}'::jsonb, 'telemetry', 'open'),
  ('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Renew SSL certificate for restcountries.com', 'Expires in 12 days (from dependencies)', '{"kind":"ssl_renew"}'::jsonb, 'dependency', 'open')
ON CONFLICT (id) DO NOTHING;

-- Schema versions + change + mapping fix (REST Countries drift story)
-- schema_json uses typed objects so the diff screen can show type changes.
INSERT INTO SchemaVersion (id, monitor_id, version, schema_json, status, created_at) VALUES
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000002', 'v1.1',
   '{"fields":{"name":"string","capital":"string","currencies":"object","region":"string","population":"number","area":"number","flag":"string"}}'::jsonb, 'expected', NOW() - INTERVAL '3 days'),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000002', 'v1.2',
   '{"fields":{"name":"string","capital_city":"string","currencies":"object","region":"string","population":"string","area":"number"}}'::jsonb, 'superseded', NOW() - INTERVAL '2 minutes')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ChangeEvent (id, monitor_id, old_schema_id, new_schema_id, change_type, detected_at, status) VALUES
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000032', 'renamed', NOW() - INTERVAL '2 minutes', 'open')
ON CONFLICT (id) DO NOTHING;

INSERT INTO MappingFix (id, change_id, fix_code, proposed_by, approved_by, approved_at, status) VALUES
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000033',
   'remap capital → capital_city; coerce population number→string', 'system', NULL, NULL, 'pending')
ON CONFLICT (id) DO NOTHING;

-- Audit trail (resolved incident)
INSERT INTO AuditLog (id, entity_type, entity_id, action, actor, payload, user_id) VALUES
  ('00000000-0000-0000-0000-000000000030', 'incident', '00000000-0000-0000-0000-000000000009', 'note', 'system',
   '{"message":"Error incident resolved via retry policy"}'::jsonb, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

SELECT 'Setu schema + seed complete' AS result;
