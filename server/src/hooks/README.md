// Hook loaders (C2)

/*
afterProbe hooks: `server/src/hooks/afterProbe/*.js`
  module.exports = { name, run: async (ctx) => {} }
  ctx = { monitor, probe, prisma }

scheduled hooks: `server/src/hooks/scheduled/*.js`
  module.exports = { name, intervalMs, run: async () => {} }
*/