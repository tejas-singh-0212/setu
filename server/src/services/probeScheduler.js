// Probe Scheduler — node-cron per monitor interval + scheduled hooks

const NodeCron = require('node-cron')
const fs = require('fs')
const { pool } = require('../lib/db')

function init(server, poolInstance) {
  // Ensure pool is passed in
  if (poolInstance) {
    // Using the pool passed in
  }

  // Read monitors from database and schedule cron jobs
  async function startCronForMonitors() {
    const result = await pool.query('SELECT * FROM monitor WHERE status = $1', ['active'])
    const monitors = result.rows

    for (const monitor of monitors) {
      const intervalSec = monitor.intervalSec || 60
      // node-cron format: second minute hour day month day-of-week
      const cronExpr = `*/${intervalSec} * * * *` // every N seconds
      NodeCron.schedule(cronExpr, async () => {
        try {
          // Run probe for this monitor
          const { runProbe } = require('./probes')
          await runProbe(monitor)
          console.log(`Probe ran for monitor ${monitor.id}`)
        } catch (e) {
          console.error(`Error in scheduled probe for ${monitor.id}:`, e)
        }
      })
      console.log(`Cron job started for monitor ${monitor.id}: every ${intervalSec}s`)
    }
  }

  startCronForMonitors()

  // Load scheduled hooks
  const hookFiles = fs.readdirSync('./src/hooks/scheduled').filter(f => f.endsWith('.js'))
  for (const file of hookFiles) {
    const hook = require(`../hooks/scheduled/${file}`)
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
}

module.exports = { init }