// Probe Scheduler — node-cron per monitor interval + scheduled hooks

const NodeCron = require('node-cron')
const fs = require('fs')
const path = require('path')
const { pool } = require('../lib/db')

function init(server, poolInstance) {
  const usePool = poolInstance || pool

  // Read monitors from database and schedule cron jobs
  async function startCronForMonitors() {
    try {
      const result = await usePool.query('SELECT * FROM monitor WHERE status = $1', ['active'])
      const monitors = result.rows

      for (const monitor of monitors) {
        const intervalSec = monitor.interval_sec || 60
        // node-cron format: second minute hour day month day-of-week
        const cronExpr = `*/${intervalSec} * * * *` // every N seconds
        NodeCron.schedule(cronExpr, async () => {
          try {
            const { runProbe } = require('./probes')
            await runProbe(monitor)
            console.log(`Probe ran for monitor ${monitor.id}`)
          } catch (e) {
            console.error(`Error in scheduled probe for ${monitor.id}:`, e)
          }
        })
        console.log(`Cron job started for monitor ${monitor.id}: every ${intervalSec}s`)
      }
    } catch (e) {
      console.error('Failed to start cron jobs:', e)
    }
  }

  startCronForMonitors()

  // Load scheduled hooks
  const hooksDir = path.join(__dirname, '../hooks/scheduled')
  try {
    const hookFiles = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.js'))
    for (const file of hookFiles) {
      const hook = require(path.join(hooksDir, file))
      const intervalMs = hook.intervalMs || 3600000 // default 1h
      setInterval(() => {
        try {
          hook.run()
        } catch (e) {
          console.error(`Error in scheduled hook "${hook.name}":`, e)
        }
      }, intervalMs)
      console.log(`Scheduled hook "${hook.name}" started: ${intervalMs}ms interval`)
    }
  } catch (e) {
    console.error('Failed to load scheduled hooks:', e)
  }
}

module.exports = { init }
