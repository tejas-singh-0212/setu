// prisma/seed.js — reproduces context.md §7 canonical demo data
// Uses the pg pool (consistent with server/src/lib/* — no Prisma client in this build)

const { pool } = require('../server/src/lib/db')

async function seed() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // --- Setting defaults ---
    await client.query(`
      INSERT INTO setting (key, value) VALUES
        ('latencyThresholdMs', '1000'::jsonb),
        ('consecutiveSlow', '3'::jsonb),
        ('maxRecoveryPerHour', '3'::jsonb),
        ('requireApproval', 'true'::jsonb),
        ('dryRunDefault', 'true'::jsonb),
        ('probeIntervalDefault', '60'::jsonb),
        ('ragEnabled', 'true'::jsonb)
      ON CONFLICT (key) DO NOTHING
    `)

    // --- Demo User: Sarah Chen ---
    await client.query(`
      INSERT INTO "User" (id, email, name, avatar_url, provider, provider_id, created_at)
      VALUES ('00000000-0000-0000-0000-000000000001', 'sarah.chen@example.com', 'Sarah Chen', NULL, 'google', 'GOOGLE123', NOW())
      ON CONFLICT (id) DO NOTHING
    `)

    // --- 4 Monitors ---
    await client.query(`
      INSERT INTO monitor (id, user_id, name, type, url, method, interval_sec, timeout_ms, retries, cache_enabled, status, health_score, created_at)
      VALUES
        ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'REST Countries API', 'api', 'https://restcountries.com/v3.1/all?fields=name,capital,currencies,region,population,area,flag', 'GET', 60, 5000, 0, false, 'active', 100, NOW()),
        ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'JSONPlaceholder', 'api', 'https://jsonplaceholder.typicode.com', 'GET', 60, 5000, 0, false, 'active', 100, NOW()),
        ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Open-Meteo Site', 'website', 'https://open-meteo.com', 'GET', 300, 5000, 0, false, 'active', 100, NOW()),
        ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Wikipedia', 'website', 'https://www.wikipedia.org', 'GET', 300, 5000, 0, false, 'active', 100, NOW())
      ON CONFLICT (id) DO NOTHING
    `)

    // --- ~100 Probes per monitor ---
    await client.query(`
      INSERT INTO probe (monitor_id, ok, status_code, latency_ms, schema_ok, error, dns_ok, ssl_days_left, at)
      SELECT '00000000-0000-0000-0000-000000000002'::uuid, true, 200, floor(random()*2000)::int, true, NULL, true, floor(random()*90)+30, NOW() - (random() * interval '24 hours')
      FROM generate_series(1, 100)
      ON CONFLICT DO NOTHING
    `)
    await client.query(`
      INSERT INTO probe (monitor_id, ok, status_code, latency_ms, schema_ok, error, dns_ok, ssl_days_left, at)
      SELECT '00000000-0000-0000-0000-000000000003'::uuid,
        CASE WHEN floor(random()*10) < 2 THEN false ELSE true END::bool,
        CASE WHEN floor(random()*10) < 2 THEN 500 ELSE 200 END::int,
        floor(random()*3000)::int, true,
        CASE WHEN floor(random()*10) < 2 THEN 'Request failed' ELSE NULL END,
        true, floor(random()*90)+30, NOW() - (random() * interval '24 hours')
      FROM generate_series(1, 100)
      ON CONFLICT DO NOTHING
    `)
    await client.query(`
      INSERT INTO probe (monitor_id, ok, status_code, latency_ms, schema_ok, error, dns_ok, ssl_days_left, at)
      SELECT '00000000-0000-0000-0000-000000000004'::uuid, true, 200, floor(random()*500)::int, true, NULL, true, floor(random()*90)+30, NOW() - (random() * interval '24 hours')
      FROM generate_series(1, 100)
      ON CONFLICT DO NOTHING
    `)
    await client.query(`
      INSERT INTO probe (monitor_id, ok, status_code, latency_ms, schema_ok, error, dns_ok, ssl_days_left, at)
      SELECT '00000000-0000-0000-0000-000000000005'::uuid, true, 200, floor(random()*500)::int, true, NULL, true, floor(random()*90)+30, NOW() - (random() * interval '24 hours')
      FROM generate_series(1, 100)
      ON CONFLICT DO NOTHING
    `)

    // --- 4 Incidents ---
    await client.query(`
      INSERT INTO incident (id, monitor_id, type, severity, title, probable_cause, status, opened_at, closed_at)
      VALUES
        ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002', 'drift', 'high', 'Schema drift detected on REST Countries API', 'Upstream renamed capital field and removed flag', 'open', NOW(), NULL),
        ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003', 'latency', 'medium', 'High latency on JSONPlaceholder', '3 consecutive calls >1000ms', 'recovering', NOW(), NULL),
        ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000005', 'dependency', 'low', 'SSL cert issue on Wikipedia', 'SSL cert expires in 12 days', 'open', NOW(), NULL),
        ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000004', 'error', 'medium', '5xx error burst on Open-Meteo', '5xx burst (7 requests/5min)', 'resolved', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `)

    // --- Incident events ---
    await client.query(`
      INSERT into incidentevent (id, incident_id, at, kind, actor, payload)
      VALUES
        ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000006', NOW(), 'detected', 'system', '{"source": "probe"}'::jsonb),
        ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000006', NOW(), 'diagnosis', 'system', '{"rules": true}'::jsonb),
        ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000007', NOW(), 'detected', 'system', '{"source": "probe"}'::jsonb),
        ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000007', NOW(), 'diagnosis', 'system', '{"rules": true}'::jsonb),
        ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000008', NOW(), 'detected', 'system', '{"source": "probe"}'::jsonb),
        ('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000009', NOW(), 'detected', 'system', '{"source": "probe"}'::jsonb),
        ('00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000009', NOW(), 'postcheck', 'system', '{"passed": true}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `)

    // --- SchemaVersion pair ---
    await client.query(`
      INSERT INTO schemaversion (id, monitor_id, version, schema_json, status, created_at)
      VALUES
        ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000002', 'v1.1', '{"fields": ["name", "capital", "currencies", "region", "population", "area", "flag"]}'::jsonb, 'expected', NOW()),
        ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000002', 'v1.2', '{"fields": ["name", "capital_city", "currencies", "region", "population", "area"]}'::jsonb, 'superseded', NOW())
      ON CONFLICT (id) DO NOTHING
    `)

    // --- ChangeEvent ---
    await client.query(`
      INSERT INTO changeevent (id, monitor_id, old_schema_id, new_schema_id, change_type, detected_at, status)
      VALUES ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000032', 'renamed', NOW(), 'open')
      ON CONFLICT (id) DO NOTHING
    `)

    // --- MappingFix ---
    await client.query(`
      INSERT INTO mappingfix (id, change_id, fix_code, proposed_by, approved_by, approved_at, status)
      VALUES ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000033', 'remap capital → capital_city; coerce population number→string', 'system', NULL, NULL, 'pending')
      ON CONFLICT (id) DO NOTHING
    `)

    // --- Dependency checks ---
    await client.query(`
      INSERT INTO dependencycheck (id, monitor_id, at, dns_ok, ssl_issuer, ssl_expires_at, ssl_days_left, upstream_hosts, rate_limited)
      VALUES
        ('00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000002', NOW(), true, 'GeoTrust Inc.', NOW() + INTERVAL '12 days', 12, '{"hosts": ["restcountries.com"]}'::jsonb, false),
        ('00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000003', NOW(), true, 'Let\'s Encrypt', NOW() + INTERVAL '84 days', 84, '{"hosts": ["jsonplaceholder.typicode.com"]}'::jsonb, false),
        ('00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000004', NOW(), true, 'DigiCert', NOW() + INTERVAL '84 days', 84, '{"hosts": ["open-meteo.com"]}'::jsonb, false),
        ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000005', NOW(), true, 'DigiCert', NOW() + INTERVAL '84 days', 84, '{"hosts": ["wikipedia.org"]}'::jsonb, false)
      ON CONFLICT (id) DO NOTHING
    `)

    // --- Recommendations ---
    await client.query(`
      INSERT INTO recommendation (id, monitor_id, title, why, action, source, status, created_at)
      VALUES
        ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000003', 'Add retry with exponential backoff to JSONPlaceholder monitor', '12 slow calls this week; 3 recovered by retry in similar past incidents (RAG ×5)', '{"kind": "retry", "backoff": "exponential"}'::jsonb, 'telemetry', 'open', NOW()),
        ('00000000-0000-0000-0000-000000000022', NULL, 'Bake capital_city remap into the transform permanently', '2nd drift this month on the same field', '{"kind": "transform", "fix": "capital→capital_city"}'::jsonb, 'rag', 'open', NOW()),
        ('00000000-0000-0000-0000-000000000023', NULL, 'Extend website probe interval to 2 minutes', '0 anomalies on website monitors in 7 days; cuts noise', '{"kind": "interval", "minutes": 120}'::jsonb, 'telemetry', 'open', NOW()),
        ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000002', 'Renew SSL certificate for restcountries.com', 'Expires in 12 days (from dependencies)', '{"kind": "ssl_renew"}'::jsonb, 'dependency', 'open', NOW())
      ON CONFLICT (id) DO NOTHING
    `)

    // --- Embeddings for RAG ---
    await client.query(`
      INSERT INTO embedding (id, kind, ref_id, content, vector)
      VALUES
        ('00000000-0000-0000-0000-000000000025', 'knowledge', NULL, 'Schema drift detection rules for REST Countries API', ARRAY[0.1,0.2,0.3]::float[]),
        ('00000000-0000-0000-0000-000000000026', 'knowledge', NULL, 'Latency anomaly detection rules', ARRAY[0.4,0.5,0.6]::float[]),
        ('00000000-0000-0000-0000-000000000027', 'knowledge', NULL, 'Dependency check SSL expiry rules', ARRAY[0.7,0.8,0.9]::float[]),
        ('00000000-0000-0000-0000-000000000028', 'knowledge', NULL, 'Recovery action guidelines', ARRAY[0.2,0.4,0.6]::float[]),
        ('00000000-0000-0000-0000-000000000029', 'knowledge', NULL, 'Incident diagnosis pattern matching', ARRAY[0.5,0.5,0.5]::float[])
      ON CONFLICT (id) DO NOTHING
    `)

    // --- Audit log ---
    await client.query(`
      INSERT INTO auditlog (id, entity_type, entity_id, action, actor, timestamp, payload)
      VALUES ('00000000-0000-0000-0000-000000000030', 'incident', '00000000-0000-0000-0000-000000000009', 'note', 'system', NOW(), '{"message": "Error incident resolved via retry policy"}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `)

    await client.query('COMMIT')
    console.log('Seed complete: all context.md §7 data inserted')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('Seed failed:', e)
    throw e
  } finally {
    client.release()
  }
}

seed()
