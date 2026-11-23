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
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    })
    if (!user) return res.status(401).json({ error: 'User not found' })
    res.json({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, provider: user.provider })
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