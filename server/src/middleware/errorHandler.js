// Centralized error handler — logs full detail, returns a safe message to clients.

module.exports = (err, req, res, next) => {
  // Always log the real error server-side; that is where debugging happens.
  console.error('ERROR:', err.stack || err.message || err)

  // If a response already started (streaming, sendFile mid-flight), Express must
  // close the connection itself. Returning here avoids "headers already sent".
  if (res.headersSent) return next(err)

  const status = err.status || 500

  // In production, a 5xx message can leak infrastructure detail — a pg failure
  // says "connect ECONNREFUSED <host>:<port>", which exposes the DB endpoint to
  // any caller of the API. Deliberate client errors (4xx) keep their message.
  const message =
    process.env.NODE_ENV === 'production' && status >= 500
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error'

  res.status(status).json({ error: message })
}
