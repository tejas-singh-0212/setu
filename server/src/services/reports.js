// Reports service (Part 3) — aggregation queries for GET /api/reports.

const { query } = require('../lib/db')

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 }

// Static-rules recovery success rate. There is no static engine to measure, so this is a
// fixed benchmark ("static rules benchmark", context.md §5.10) shown next to the measured rate.
const STATIC_RULES_BENCHMARK = 64
// Shown for intelligent recovery only while no recovery action has been executed yet.
const INTELLIGENT_BENCHMARK = 91

// Recovery actions that reached execution (anything past approval).
const EXECUTED_STATUSES = ['executed', 'verified', 'failed']

async function stats(days, userId) {
  const { rows } = await query(
    `WITH inc AS (
       SELECT i.* FROM incident i
       JOIN monitor m ON m.id = i.monitor_id
       WHERE m.user_id = $2 AND i.opened_at >= NOW() - make_interval(days => $1)
     ),
     manual AS (
       SELECT DISTINCT ra.incident_id FROM recoveryaction ra
       JOIN inc ON inc.id = ra.incident_id
       WHERE ra.approved_by IS NOT NULL AND ra.approved_by <> 'system'
     )
     SELECT
       (SELECT COUNT(*) FROM inc)::int AS incidents,
       (SELECT COUNT(*) FROM inc WHERE status = 'resolved'
          AND id NOT IN (SELECT incident_id FROM manual))::int AS auto_recovered,
       (SELECT COUNT(*) FROM recoveryaction ra JOIN inc ON inc.id = ra.incident_id
          WHERE ra.approved_by IS NOT NULL AND ra.approved_by <> 'system')::int AS manual_approvals,
       (SELECT AVG(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 60) FROM inc
          WHERE status = 'resolved' AND closed_at IS NOT NULL) AS mttr_minutes`,
    [days, userId]
  )
  const r = rows[0]
  return {
    incidents: r.incidents,
    autoRecovered: r.auto_recovered,
    manualApprovals: r.manual_approvals,
    mttrMinutes: r.mttr_minutes === null ? null : Math.round(Number(r.mttr_minutes) * 10) / 10,
  }
}

async function effectiveness(days, userId) {
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE ra.status = ANY($2))::int AS executed,
       COUNT(*) FILTER (WHERE ra.status = 'verified')::int AS verified
     FROM recoveryaction ra
     JOIN incident i ON i.id = ra.incident_id
     JOIN monitor m ON m.id = i.monitor_id
     WHERE m.user_id = $3
       AND COALESCE(ra.executed_at, i.opened_at) >= NOW() - make_interval(days => $1)`,
    [days, EXECUTED_STATUSES, userId]
  )
  const { executed, verified } = rows[0]
  const measured = executed > 0
  return {
    intelligent: measured ? Math.round((verified / executed) * 100) : INTELLIGENT_BENCHMARK,
    static: STATIC_RULES_BENCHMARK,
    intelligentBasis: measured ? 'measured' : 'benchmark',
    staticBasis: 'static rules benchmark',
    sample: { executed, verified },
  }
}

async function history(days, userId) {
  const { rows } = await query(
    `SELECT i.id, i.opened_at, i.closed_at, i.type, i.severity, i.status, i.title,
            i.probable_cause, i.diagnosis, m.id AS monitor_id, m.name AS monitor_name,
            ra.kind AS action_kind, ra.status AS action_status, ra.post_check_ok,
            pc.passed AS event_post_check
     FROM incident i
     JOIN monitor m ON m.id = i.monitor_id
     LEFT JOIN LATERAL (
       SELECT kind, status, post_check_ok FROM recoveryaction
       WHERE incident_id = i.id ORDER BY executed_at DESC NULLS LAST LIMIT 1
     ) ra ON true
     LEFT JOIN LATERAL (
       SELECT (payload->>'passed')::boolean AS passed FROM incidentevent
       WHERE incident_id = i.id AND kind = 'postcheck' ORDER BY at DESC LIMIT 1
     ) pc ON true
     WHERE m.user_id = $2 AND i.opened_at >= NOW() - make_interval(days => $1)
     ORDER BY i.opened_at DESC`,
    [days, userId]
  )
  return rows.map((r) => {
    const postCheck = r.post_check_ok ?? r.event_post_check ?? null
    const diagnosis =
      (r.diagnosis && (r.diagnosis.summary || r.diagnosis.rootCause)) || r.probable_cause || null
    return {
      id: r.id,
      openedAt: r.opened_at,
      closedAt: r.closed_at,
      monitorId: r.monitor_id,
      monitorName: r.monitor_name,
      type: r.type,
      severity: r.severity,
      status: r.status,
      title: r.title,
      diagnosis,
      action: r.action_kind ? { kind: r.action_kind, status: r.action_status } : null,
      postCheck, // true | false | null (not run)
      durationMinutes: r.closed_at
        ? Math.round(((new Date(r.closed_at) - new Date(r.opened_at)) / 60000) * 10) / 10
        : null,
    }
  })
}

async function build(range = '7d', userId) {
  const days = RANGE_DAYS[range]
  const [s, e, h] = await Promise.all([stats(days, userId), effectiveness(days, userId), history(days, userId)])
  return { range, stats: s, effectiveness: e, history: h }
}

module.exports = { RANGE_DAYS, STATIC_RULES_BENCHMARK, INTELLIGENT_BENCHMARK, build }
