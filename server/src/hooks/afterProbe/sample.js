// Sample afterProbe hook — runs after every probe (C2 contract)

const { pool } = require('../../lib/db')

module.exports = {
  name: 'sample-after-probe',
  run: async (ctx) => {
    const { monitor, probe } = ctx
    // Example: update monitor health score based on probe result
    if (!probe.ok) {
      await pool.query(
        'UPDATE monitor SET health_score = GREATEST(health_score - 5, 0) WHERE id = $1',
        [monitor.id]
      )
    }
    console.log(`After-probe hook "${this.name}" ran for monitor ${monitor.id}, probe ok: ${probe.ok}`)
  },
}
