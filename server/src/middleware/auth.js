// Auth middleware — Passport Google/GitHub OAuth + requireAuth

const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy
const GitHubStrategy = require('passport-github2').Strategy
const { Pool } = require('pg')
const { v4: uuidv4 } = require('uuid')

// --- Database pool for user upsert ---
const { pool } = require('../lib/db')

async function findOrCreateUser(profile, done) {
  const email = profile.emails?.[0]?.value
  const name = profile.displayName
  const avatarUrl = profile.photos?.[0]?.value
  const provider = profile.provider
  const providerId = profile.id

  if (!email) return done(new Error('No email in profile'))

  try {
    // Check if user exists
    const { rows } = await pool.query('SELECT * FROM "User" WHERE email = $1', [email])
    if (rows.length > 0) {
      const user = rows[0]
      // Update profile info
      await pool.query(
        'UPDATE "User" SET name = $1, avatar_url = $2, provider = $3, provider_id = $4 WHERE id = $5',
        [name, avatarUrl, provider, providerId, user.id]
      )
      return done(null, user)
    } else {
      // Create new user
      const { rows } = await pool.query(
        `INSERT INTO "User" (id, email, name, avatar_url, provider, provider_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [uuidv4(), email, name, avatarUrl, provider, providerId]
      )
      return done(null, rows[0])
    }
  } catch (err) {
    done(err)
  }
}

// Google Strategy — only if credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    'google',
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/api/auth/google/callback',
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          await findOrCreateUser(profile, done)
        } catch (err) {
          done(err)
        }
      }
    )
  )
} else {
  // Mock Google strategy when no credentials — just pass through
  passport.use(
    'google',
    async (accessToken, refreshToken, profile, done) => {
      done(null, { provider: 'google', id: 'mock-google-id' })
    }
  )
}

// GitHub Strategy — only if credentials are configured
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    'github',
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: '/api/auth/github/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          await findOrCreateUser(profile, done)
        } catch (err) {
          done(err)
        }
      }
    )
  )
} else {
  // Mock GitHub strategy when no credentials
  passport.use(
    'github',
    async (accessToken, refreshToken, profile, done) => {
      done(null, { provider: 'github', id: 'mock-github-id' })
    }
  )
}

// Session serialization — store only user id in the session
passport.serializeUser((user, done) => done(null, user.id))

passport.deserializeUser((id, done) => {
  pool.query('SELECT * FROM "User" WHERE id = $1', [id], (err, result) => {
    if (err) return done(err)
    done(null, result.rows[0])
  })
})

// --- Middleware: requireAuth ---

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    // OAuth runs with `session: false`, so Passport never repopulates req.user
    // on subsequent requests. Expose the session identity as req.user so routes
    // can rely on the conventional contract instead of reaching into the session.
    if (!req.user) req.user = { id: req.session.userId }
    return next()
  }
  res.status(401).json({ error: 'Unauthenticated' })
}

// --- Auth helpers ---

async function loginUser(req, user) {
  req.session.userId = user.id
  // Keep req.user consistent for the request that performed the login.
  req.user = user
}

async function logoutUser(req) {
  req.session.destroy()
}

module.exports = {
  requireAuth,
  loginUser,
  logoutUser,
}