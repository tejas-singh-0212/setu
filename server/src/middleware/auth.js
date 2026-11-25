// Auth middleware — Passport Google/GitHub OAuth + requireAuth (Part 1, fixed)
// Login state lives in req.session.userId (set by loginUser). When OAuth
// credentials are NOT configured, the strategies fall back to the seeded demo
// user so the app remains fully usable locally.

const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy
const GitHubStrategy = require('passport-github2').Strategy
const { v4: uuidv4 } = require('uuid')
const { pool } = require('../lib/db')

const DEMO_EMAIL = 'sarah.chen@example.com'

// OAuth callbacks are ABSOLUTE so exactly one redirect URI per provider works
// from any dev host (Vite on :5173 or single-origin on :4000).
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:4000'

async function findOrCreateUser(profile) {
  // Prefer a real email; fall back to a stable provider-scoped address
  // (GitHub keeps emails private by default).
  const email =
    profile.emails?.[0]?.value ||
    `${profile.provider}:${profile.id}@users.setu.local`
  const name = profile.displayName || profile.username || email
  const avatarUrl = profile.photos?.[0]?.value || null
  const provider = profile.provider
  const providerId = String(profile.id)

  const existing = await pool.query('SELECT * FROM "User" WHERE email = $1', [email])
  if (existing.rows.length) {
    const user = existing.rows[0]
    await pool.query(
      `UPDATE "User" SET name = $2, avatar_url = $3, provider = $4, provider_id = $5 WHERE id = $1`,
      [user.id, name, avatarUrl, provider, providerId]
    )
    return user
  }
  const inserted = await pool.query(
    `INSERT INTO "User" (id, email, name, avatar_url, provider, provider_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
    [uuidv4(), email, name, avatarUrl, provider, providerId]
  )
  return inserted.rows[0]
}

// Seeded demo user — used as the no-credentials fallback.
async function demoUser() {
  const existing = await pool.query('SELECT * FROM "User" WHERE email = $1', [DEMO_EMAIL])
  if (existing.rows.length) return existing.rows[0]
  const inserted = await pool.query(
    `INSERT INTO "User" (id, email, name, avatar_url, provider, provider_id, created_at)
     VALUES ($1, $2, 'Sarah Chen', NULL, 'google', 'demo', NOW()) RETURNING *`,
    [uuidv4(), DEMO_EMAIL]
  )
  return inserted.rows[0]
}

// Minimal strategy used when OAuth credentials are absent (no console errors,
// no 500s — the demo user is signed in instead).
function mockStrategy(provider) {
  return {
    name: provider,
    authenticate() {
      demoUser()
        .then((user) => this.success(user))
        .catch((err) => this.fail(err))
    },
  }
}

// ---------- Google ----------
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    'google',
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${PUBLIC_BASE_URL}/api/auth/google/callback`,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          done(null, await findOrCreateUser(profile))
        } catch (err) {
          done(err)
        }
      }
    )
  )
} else {
  passport.use('google', mockStrategy('google'))
}

// ---------- GitHub ----------
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    'github',
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: `${PUBLIC_BASE_URL}/api/auth/github/callback`,
        scope: ['user:email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          done(null, await findOrCreateUser(profile))
        } catch (err) {
          done(err)
        }
      }
    )
  )
} else {
  passport.use('github', mockStrategy('github'))
}

// Session serialization — store only the user id
passport.serializeUser((user, done) => done(null, user.id))

passport.deserializeUser((id, done) => {
  pool.query('SELECT * FROM "User" WHERE id = $1', [id], (err, result) => {
    if (err) return done(err)
    done(null, result.rows[0] || false)
  })
})

// ---------- Middleware ----------

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    // OAuth runs with session:false, so Passport never repopulates req.user on
    // later requests. Expose the session identity as req.user so routes can use
    // the conventional contract (idea from PR #13).
    if (!req.user) req.user = { id: req.session.userId }
    return next()
  }
  res.status(401).json({ error: 'Unauthenticated' })
}

// ---------- Auth helpers ----------

async function loginUser(req, user) {
  req.session.userId = user.id
  req.user = user // keep req.user consistent for the login request itself
}

async function logoutUser(req) {
  await new Promise((resolve) => req.session.destroy(() => resolve()))
}

module.exports = { requireAuth, loginUser, logoutUser }
