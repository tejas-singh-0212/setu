// Express bootstrap — port 4000 · JSON body · CORS · sessions · Passport ·
// auto-mounted routes (C1) · probe scheduler · static client build · error handler

require('dotenv').config()
const path = require('path')
const fs = require('fs')
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

// CORS — dev (Vite on 5173) and single-origin (4000) both allowed with cookies
const origins = new Set(
  [process.env.CLIENT_URL, 'http://localhost:5173', 'http://localhost:4000'].filter(Boolean)
)
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || origins.has(origin)),
    credentials: true,
  })
)

// Session store → Postgres via connect-pg-simple
app.use(
  session({
    store: new connectPgSession({ pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET || 'setu-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, sameSite: 'lax' }, // 1 day
  })
)

app.use(passport.initialize())
app.use(passport.session())

// ---------- Route auto-mount (C1) ----------
// Any file `server/src/routes/<name>.js` exporting an Express router is
// mounted at `/api/<name>`. Directory is resolved relative to THIS file so
// the server boots no matter which cwd it is started from.
const routesDir = path.join(__dirname, 'routes')
const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'))
routeFiles.forEach((file) => {
  const router = require(path.join(routesDir, file))
  app.use(`/api/${file.replace('.js', '')}`, router)
})

// ---------- Health ----------
app.get('/api/ping', (req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }))

// Unknown API paths → JSON 404 (before the SPA fallback)
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))

// ---------- Built client (single-origin mode) ----------
// When client/dist exists, Express serves the SPA — one URL for the demo,
// no dev proxy involved. Unknown /api paths still 404 as JSON.
const clientDist = path.join(__dirname, '../../client/dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// ---------- Error handler (last) ----------
app.use(errorHandler)

// ---------- Start server ----------
const server = app.listen(PORT, () => {
  console.log(`Setu server listening on http://localhost:${PORT}`)
  if (fs.existsSync(clientDist)) console.log(`Serving built client from client/dist`)
})

// Initialize probe scheduler (cron jobs + scheduled hooks)
require('./services/probeScheduler').init(server, pool)

module.exports = app
