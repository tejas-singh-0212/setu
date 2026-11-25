// Sample afterProbe hook (C2) — template for hook authors; log-only so it
// never double-penalisises health (runProbe already updates health_score).
// Copy this file, rename it, and edit run(ctx).

module.exports = {
  name: 'sample-after-probe',
  run: async (ctx) => {
    const { monitor, probe } = ctx
    // ctx = { monitor, probe, payload, pool }
    // payload = parsed JSON response body for API monitors (else null)
    console.log(
      `[hook] after-probe monitor="${monitor.name}" ok=${probe.ok} latency=${probe.latency_ms}ms`
    )
  },
}
