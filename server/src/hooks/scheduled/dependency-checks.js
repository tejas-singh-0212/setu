// Sample scheduled hook — runs dependency checks on a schedule

module.exports = {
  name: 'dependency-checks',
  intervalMs: 3600000, // 1 hour
  run: async () => {
    // This would fetch active monitors and run DNS/SSL checks
    // For now, just a placeholder
    console.log('Dependency check hook running...')
  },
}