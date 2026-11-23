// Scheduled hook (C2, Part 3) — hourly DNS + SSL checks for every active monitor.

const { checkAllActive } = require('../../services/checks')

module.exports = {
  name: 'dependency-checks',
  intervalMs: 3600000, // 1 hour
  run: async () => {
    // The loader calls run() without awaiting, so never let a rejection escape.
    try {
      const results = await checkAllActive()
      const opened = results.filter((r) => r.incident).length
      console.log(`dependency-checks: ${results.length} monitors checked, ${opened} SSL incidents opened`)
    } catch (e) {
      console.error('dependency-checks failed:', e)
    }
  },
}
