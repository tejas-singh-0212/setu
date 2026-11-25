// Probe Scheduler — node-cron per monitor interval + scheduled hooks (C2)
// Monitors added while running are picked up by a 60s refresh; hooks are
// awaited so rejections are logged instead of crashing the process.

const NodeCron = require('node-cron')
const fs = require('fs')
const path = require('path')
const { pool } = require('../lib/db')

let monitorTasks = [] // current cron tasks, replaced on refresh

function scheduleMonitor(monitor) {
  const intervalSec = monitor.interval_sec || 60
  // node-cron's 5-field expression has MINUTES as field 1 — interval_sec must
  // be converted, otherwise `*/60` means "minute 0 of every hour".
  const intervalMin = Math.max(1, Math.round(intervalSec / 60))
  const cronExpr = intervalMin <= 59
    ? `*/${intervalMin} * * * *`
    : `0 */${Math.min(23, Math.max(1, Math.round(intervalMin / 60)))} * * * *`
  const task = NodeCron.schedule(cronExpr, async () => {
    try {
      const { runProbe } = require('./probes')
      await runProbe(monitor)
      console.log(`Probe ran for monitor ${monitor.name || monitor.id}`)
    } catch (e) {
      console.error(`Error in scheduled probe for ${monitor.id}:`, e)
    }
  })
  console.log(`Cron job started for monitor ${monitor.name || monitor.id}: ${cronExpr}`)
  return task
}

async function refreshMonitors() {
  try {
    const result = await pool.query(
      `SELECT * FROM monitor WHERE status = 'active' ORDER BY created_at`
    )
    const seen = new Set(result.rows.map((r) => r.id))
    // Stop tasks for removed/paused monitors
    monitorTasks = monitorTasks.filter((t) => {
      if (!seen.has(t.monitorId)) {
        try { t.task.stop() } catch (e) { /* already stopped */ }
        return false
      }
      return true
    })
    const scheduled = new Set(monitorTasks.map((t) => t.monitorId))
    for (const monitor of result.rows) {
      if (scheduled.has(monitor.id)) continue
      monitorTasks.push({ monitorId: monitor.id, task: scheduleMonitor(monitor) })
    }
  } catch (e) {
    console.error('Failed to refresh monitor cron jobs:', e.message)
  }
}

function init(server, poolInstance) {
  const usePool = poolInstance || pool
  void usePool

  refreshMonitors()
  setInterval(refreshMonitors, 60000) // pick up new/paused monitors within a minute

  // Load scheduled hooks
  const hooksDir = path.join(__dirname, '../hooks/scheduled')
  try {
    const hookFiles = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.js'))
    for (const file of hookFiles) {
      const hook = require(path.join(hooksDir, file))
      const intervalMs = hook.intervalMs || 3600000 // default 1h
      const tick = () => {
        Promise.resolve()
          .then(() => hook.run())
          .catch((e) => console.error(`Scheduled hook "${hook.name}" failed:`, e))
      }
      setInterval(tick, intervalMs)
      tick() // run once at boot so checks exist without waiting a full interval
      console.log(`Scheduled hook "${hook.name}" started: ${intervalMs}ms interval`)
    }
  } catch (e) {
    console.error('Failed to load scheduled hooks:', e)
  }
}

module.exports = { init }
