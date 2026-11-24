-- Database setup for Setu
-- Types
CREATE TYPE monitor_type AS ENUM ('website', 'api');
CREATE TYPE monitor_status AS ENUM ('active', 'paused');
CREATE TYPE incident_status AS ENUM ('open', 'diagnosing', 'recovering', 'resolved', 'failed');
CREATE TYPE recovery_action_status AS ENUM ('pending', 'approved', 'rejected', 'executed', 'verified', 'failed');
CREATE TYPE change_type AS ENUM ('renamed', 'removed', 'type_changed');
CREATE TYPE incident_type AS ENUM ('drift', 'latency', 'error', 'dependency');

-- Users table
CREATE TABLE IF NOT EXISTS "User" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url VARCHAR(255),
  provider VARCHAR(50),
  provider_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Monitors table
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

-- Probes table
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

-- Incidents table
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

-- Incident events table
CREATE TABLE IF NOT EXISTS IncidentEvent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES Incident(id) ON DELETE CASCADE,
  at TIMESTAMP DEFAULT NOW(),
  kind VARCHAR(50) NOT NULL,
  actor VARCHAR(255),
  payload JSONB
);

-- Recovery actions table
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

-- Dependency checks table
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

-- Recommendations table
CREATE TABLE IF NOT EXISTS Recommendation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID REFERENCES Monitor(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  why TEXT NOT NULL,
  action JSONB DEFAULT '{}'::jsonb,
  source VARCHAR(50) DEFAULT 'telemetry',
  status VARCHAR(50) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Schema versions table
CREATE TABLE IF NOT EXISTS SchemaVersion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID REFERENCES Monitor(id) ON DELETE CASCADE,
  version VARCHAR(100) NOT NULL,
  schema_json JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'expected',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Change events table
CREATE TABLE IF NOT EXISTS ChangeEvent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID REFERENCES Monitor(id) ON DELETE CASCADE,
  old_schema_id UUID REFERENCES SchemaVersion(id),
  new_schema_id UUID REFERENCES SchemaVersion(id),
  change_type change_type NOT NULL,
  detected_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'open'
);

-- Mapping fixes table
CREATE TABLE IF NOT EXISTS MappingFix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_id UUID REFERENCES ChangeEvent(id),
  fix_code TEXT,
  proposed_by VARCHAR(255),
  approved_by VARCHAR(255),
  approved_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending'
);

-- Audit log table
CREATE TABLE IF NOT EXISTS AuditLog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor VARCHAR(255),
  timestamp TIMESTAMP DEFAULT NOW(),
  payload JSONB
);

-- Embeddings table (pgvector)
CREATE TABLE IF NOT EXISTS Embedding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(50) NOT NULL,
  ref_id UUID,
  content TEXT,
  vector FLOAT[384]
);

-- Settings table
CREATE TABLE IF NOT EXISTS Setting (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Default settings
INSERT INTO Setting (key, value) VALUES 
  ('latencyThresholdMs', '1000'::jsonb),
  ('consecutiveSlow', '3'::jsonb),
  ('maxRecoveryPerHour', '3'::jsonb),
  ('requireApproval', 'true'::jsonb),
  ('dryRunDefault', 'true'::jsonb),
  ('probeIntervalDefault', '60'::jsonb),
  ('ragEnabled', 'true'::jsonb);

-- Default user (Sarah Chen)
INSERT INTO "User" (id, email, name, avatar_url, provider, provider_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'sarah.chen@example.com', 'Sarah Chen', NULL, 'google', 'GOOGLE123');

-- 4 Monitors
INSERT INTO Monitor (id, user_id, name, type, url, method, interval_sec, timeout_ms, retries, cache_enabled, status, health_score) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'REST Countries API', 'api', 'https://restcountries.com/v3.1/all?fields=name,capital,currencies,region,population,area,flag', 'GET', 60, 5000, 0, false, 'active', 100),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'JSONPlaceholder', 'api', 'https://jsonplaceholder.typicode.com', 'GET', 60, 5000, 0, false, 'active', 100),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Open-Meteo Site', 'website', 'https://open-meteo.com', 'GET', 300, 5000, 0, false, 'active', 100),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Wikipedia', 'website', 'https://www.wikipedia.org', 'GET', 300, 5000, 0, false, 'active', 100);

-- Sample probes (100 per monitor)
INSERT INTO Probe (monitor_id, ok, status_code, latency_ms, schema_ok, error, dns_ok, ssl_days_left) 
SELECT '00000000-0000-0000-0000-000000000002'::uuid, true, 200, floor(random()*2000)::int, true, NULL, true, floor(random()*90)+30
FROM generate_series(1, 100)
UNION ALL
-- ok and error come from ONE random draw per row, so a failed probe always
-- carries an error message and a 5xx status instead of contradictory values.
SELECT '00000000-0000-0000-0000-000000000003'::uuid, rnd.r >= 0.25,
  CASE WHEN rnd.r >= 0.25 THEN 200 ELSE 503 END, floor(random()*3000)::int, true,
  CASE WHEN rnd.r >= 0.25 THEN NULL ELSE 'Request failed' END, true, floor(random()*90)+30
FROM generate_series(1, 100)
CROSS JOIN LATERAL (SELECT random() AS r) rnd
UNION ALL
SELECT '00000000-0000-0000-0000-000000000004'::uuid, true, 200, floor(random()*500)::int, true, NULL, true, floor(random()*90)+30
FROM generate_series(1, 100)
UNION ALL
SELECT '00000000-0000-0000-0000-000000000005'::uuid, true, 200, floor(random()*500)::int, true, NULL, true, floor(random()*90)+30
FROM generate_series(1, 100);

-- 4 Incidents
-- closed_at is only meaningful for resolved incidents; the other rows stay NULL.
INSERT INTO Incident (id, monitor_id, type, severity, title, probable_cause, status, opened_at, closed_at) VALUES
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002', 'drift', 'high', 'Schema drift detected on REST Countries API', 'Upstream renamed capital field and removed flag', 'open', NOW(), NULL),
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003', 'latency', 'medium', 'High latency on JSONPlaceholder', '3 consecutive calls >1000ms', 'recovering', NOW(), NULL),
  ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000005', 'dependency', 'low', 'SSL cert issue on Wikipedia', 'SSL cert expires in 12 days', 'open', NOW(), NULL),
  ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000004', 'error', 'medium', '5xx error burst on Open-Meteo', '5xx burst (7 requests/5min)', 'resolved', NOW(), NOW());

-- Incident events
INSERT INTO IncidentEvent (id, incident_id, kind, actor, payload) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000006', 'detected', 'system', '{"source": "probe"}'::jsonb),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000006', 'diagnosis', 'system', '{"rules": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000007', 'detected', 'system', '{"source": "probe"}'::jsonb),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000007', 'diagnosis', 'system', '{"rules": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000008', 'detected', 'system', '{"source": "probe"}'::jsonb),
  ('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000009', 'detected', 'system', '{"source": "probe"}'::jsonb),
  ('00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000009', 'postcheck', 'system', '{"passed": true}'::jsonb);

-- Dependency checks
INSERT INTO DependencyCheck (id, monitor_id, at, dns_ok, ssl_issuer, ssl_expires_at, ssl_days_left, upstream_hosts, rate_limited) VALUES
  ('00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000002', NOW(), true, 'GeoTrust Inc.', NOW() + INTERVAL '12 days', 12, '{"hosts": ["restcountries.com"]}'::jsonb, false),
  ('00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000003', NOW(), true, 'Let''s Encrypt', NOW() + INTERVAL '84 days', 84, '{"hosts": ["jsonplaceholder.typicode.com"]}'::jsonb, false),
  ('00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000004', NOW(), true, 'DigiCert', NOW() + INTERVAL '84 days', 84, '{"hosts": ["open-meteo.com"]}'::jsonb, false),
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000005', NOW(), true, 'DigiCert', NOW() + INTERVAL '84 days', 84, '{"hosts": ["wikipedia.org"]}'::jsonb, false);

-- Recommendations
INSERT INTO Recommendation (id, monitor_id, title, why, action, source, status) VALUES
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000003', 'Add retry with exponential backoff to JSONPlaceholder monitor', '12 slow calls this week; 3 recovered by retry in similar past incidents (RAG ×5)', '{"kind": "retry", "backoff": "exponential"}'::jsonb, 'telemetry', 'open'),
  ('00000000-0000-0000-0000-000000000022', NULL, 'Bake capital_city remap into the transform permanently', '2nd drift this month on the same field', '{"kind": "transform", "fix": "capital→capital_city"}'::jsonb, 'rag', 'open'),
  ('00000000-0000-0000-0000-000000000023', NULL, 'Extend website probe interval to 2 minutes', '0 anomalies on website monitors in 7 days; cuts noise', '{"kind": "interval", "minutes": 120}'::jsonb, 'telemetry', 'open'),
  ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000002', 'Renew SSL certificate for restcountries.com', 'Expires in 12 days (from dependencies)', '{"kind": "ssl_renew"}'::jsonb, 'dependency', 'open');

-- Embeddings for RAG
INSERT INTO Embedding (id, kind, ref_id, content, vector) VALUES
  ('00000000-0000-0000-0000-000000000025', 'knowledge', NULL, 'Schema drift detection rules for REST Countries API', '[]'::float[]),
  ('00000000-0000-0000-0000-000000000026', 'knowledge', NULL, 'Latency anomaly detection rules', '[]'::float[]),
  ('00000000-0000-0000-0000-000000000027', 'knowledge', NULL, 'Dependency check SSL expiry rules', '[]'::float[]),
  ('00000000-0000-0000-0000-000000000028', 'knowledge', NULL, 'Recovery action guidelines', '[]'::float[]),
  ('00000000-0000-0000-0000-000000000029', 'knowledge', NULL, 'Incident diagnosis pattern matching', '[]'::float[]);

-- SchemaVersion pair for REST Countries API (v1.1 expected / v1.2 detected)
INSERT INTO SchemaVersion (id, monitor_id, version, schema_json, status) VALUES
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000002', 'v1.1', '{"fields": ["name", "capital", "currencies", "region", "population", "area", "flag"]}'::jsonb, 'expected'),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000002', 'v1.2', '{"fields": ["name", "capital_city", "currencies", "region", "population", "area"]}'::jsonb, 'superseded');

-- ChangeEvent linking the two schema versions
INSERT INTO ChangeEvent (id, monitor_id, old_schema_id, new_schema_id, change_type, detected_at, status) VALUES
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000032', 'renamed', NOW(), 'open');

-- One pending MappingFix for the capital→capital_city rename + population type coercion
INSERT INTO MappingFix (id, change_id, fix_code, proposed_by, approved_by, approved_at, status) VALUES
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000033', 'remap capital → capital_city; coerce population number→string', 'system', NULL, NULL, 'pending');

-- Audit log entry
INSERT INTO AuditLog (id, entity_type, entity_id, action, actor, payload) VALUES
  ('00000000-0000-0000-0000-000000000030', 'incident', '00000000-0000-0000-0000-000000000009', 'note', 'system', '{"message": "Error incident resolved via retry policy"}'::jsonb);

SELECT 'Database setup complete';