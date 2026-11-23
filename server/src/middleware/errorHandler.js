// Centralized error handler — returns JSON error response with appropriate status

module.exports = (err, req, res, next) => {
  console.error('ERROR:', err.stack || err.message || err)
  const status = err.status || 500
  const message = err.message || 'Internal Server Error'
  res.status(status).json({ error: message })
}