const { query } = require('../lib/db')
const router = require('express').Router()
const passport = require('passport')
const authMiddleware = require('../middleware/auth')

// Where the app lives after login (single-origin :4000 or the Vite dev server).
const CLIENT = process.env.CLIENT_URL || 'http://localhost:4000'
const DASHBOARD = `${CLIENT}/dashboard`

// Login entry point. A custom callback is required because:
//  - passport only redirects after success when successRedirect is set;
//    without it the request falls through to the /api JSON 404 handler
//    (browser lands on {"error":"Not found"});
//  - even with a redirect, passport's own req.logIn stores the id under
//    session.passport.user, but requireAuth checks session.userId — which
//    only loginUser() sets. So the session must be established HERE.
// Real OAuth strategies never complete on the entry route (they redirect to
// the provider via strategy.redirect, which ends the response directly), so
// this only changes the local mock path and the production no-creds path.
function entryLogin(provider, scope) {
  return (req, res, next) => {
    passport.authenticate(provider, { scope, session: false }, (err, user) => {
      if (err) return next(err)
      if (!user) return res.status(401).json({ error: 'Login failed — authentication was not completed' })
      authMiddleware
        .loginUser(req, user)
        .then(() => res.redirect(DASHBOARD))
        .catch(next)
    })(req, res, next)
  }
}

// Google OAuth login
router.get('/google', entryLogin('google', ['profile', 'email']))

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  async (req, res, next) => {
    try {
      await authMiddleware.loginUser(req, req.user)
      res.redirect(DASHBOARD)
    } catch (e) { next(e) }
  }
)

// GitHub OAuth login
router.get('/github', entryLogin('github', ['user:email']))

// GitHub OAuth callback
router.get('/github/callback',
  passport.authenticate('github', { session: false }),
  async (req, res, next) => {
    try {
      await authMiddleware.loginUser(req, req.user)
      res.redirect(DASHBOARD)
    } catch (e) { next(e) }
  }
)

// Get current user (protected)
router.get('/me', authMiddleware.requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, name, avatar_url AS "avatarUrl", provider FROM "User" WHERE id = $1',
      [req.session.userId]
    )
    if (!result.rows.length) return res.status(401).json({ error: 'User not found' })
    res.json(result.rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Logout
router.post('/logout', authMiddleware.requireAuth, async (req, res, next) => {
  try {
    await authMiddleware.logoutUser(req)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

module.exports = router