// Express bootstrap — port 4000 · JSON body · CORS · sessions · Passport · auto‑mounted routes · probe scheduler · error handler

require('dotenv').config()
const express = require('express')
const cors = require('cors')
const session = require('express-session')
const connectPgSession = require('connect-pg-simple')(session)
const { pool } = require('./lib/db')
const passport = require('passport')
const authMiddleware = require('./middleware/auth')
const errorHandler = require('./middleware/errorHandler')

const app = express()
const PORT = process.env.PORT || 4000

// ---------- Middleware ----------
app.use(express.json())
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
)

// Session store → Postgres via connect-pg-simple
const PostgreSQLStore = connectPgSession
const pgSessionInstance = new PostgreSQLStore({
  pool,
})

app.use(
  session({
    store: new PostgreSQLStore({
      pool,
      tableName: 'session',
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 1 day
  })
)

app.use(passport.initialize())
app.use(passport.session())

// ---------- Route auto-mount (C1) ----------
// Any file `server/src/routes/<name>.js` that exports an Express router
// is automatically mounted at `/api/<name>`.
const fs = require('fs')
const routesDir = './src/routes'
const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'))
routeFiles.forEach((file) => {
  const router = require(`./routes/${file}`)
  app.use(`/api/${file.replace('.js', '')}`, router)
})

// ---------- C2: Hook loaders ----------
// afterProbe hooks: `server/src/hooks/afterProbe/*.js`
// scheduled hooks: `server/src/hooks/scheduled/*.js`
// (These are loaded by the probe scheduler; see probeScheduler.js)

// ---------- Health ----------
app.get('/api/ping', (req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }))

// ---------- Error handler (last) ----------
app.use(errorHandler)

// ---------- Start server ----------
const server = app.listen(PORT, () => {
  console.log(`Setu server listening on http://localhost:${PORT}`)
})

// Initialize probe scheduler (starts cron jobs + scheduled hooks)
require('./services/probeScheduler').init(server, pool)

// Export app for testing
module.exports = app