const { query } = require('../lib/db')
const router = require('express').Router()
const passport = require('passport')
const authMiddleware = require('../middleware/auth')

// Google OAuth login
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    await authMiddleware.loginUser(req, req.user)
    res.redirect(process.env.CLIENT_URL + '/dashboard')
  }
)

// GitHub OAuth login
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }))

// GitHub OAuth callback
router.get('/github/callback',
  passport.authenticate('github', { session: false }),
  async (req, res) => {
    await authMiddleware.loginUser(req, req.user)
    res.redirect(process.env.CLIENT_URL + '/dashboard')
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
router.post('/logout', authMiddleware.requireAuth, async (req, res) => {
  await authMiddleware.logoutUser(req)
  res.json({ ok: true })
})

module.exports = router