// Sample afterProbe hook — runs after every probe

module.exports = {
  name: 'sample-after-probe',
  run: async (ctx) => {
    const { monitor, probe, prisma } = ctx
    // Example: update monitor health score based on probe result
    if (!probe.ok) {
      await prisma.monitor.update({
        where: { id: monitor.id },
        data: { healthScore: Math.max(monitor.healthScore - 5, 0) },
      })
    }
    console.log(`After-probe hook "${this.name}" ran for monitor ${monitor.id}, probe ok: ${probe.ok}`)
  },
}