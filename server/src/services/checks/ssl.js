// SSL check (Part 3) — reads the peer certificate on :443.
// Returns { sslIssuer, sslExpiresAt, sslDaysLeft }; on any failure all three are null.

const tls = require('tls')

const TIMEOUT_MS = 5000
const DAY_MS = 24 * 60 * 60 * 1000

const EMPTY = { sslIssuer: null, sslExpiresAt: null, sslDaysLeft: null }

function issuerName(issuer) {
  if (!issuer) return null
  return issuer.O || issuer.CN || null
}

function checkSsl(host, port = 443) {
  return new Promise((resolve) => {
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }

    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false })
    socket.setTimeout(TIMEOUT_MS, () => done(EMPTY))
    socket.on('error', () => done(EMPTY))
    socket.on('secureConnect', () => {
      const cert = socket.getPeerCertificate()
      if (!cert || !cert.valid_to) return done(EMPTY)
      const expiresAt = new Date(cert.valid_to)
      if (Number.isNaN(expiresAt.getTime())) return done(EMPTY)
      done({
        sslIssuer: issuerName(cert.issuer),
        sslExpiresAt: expiresAt,
        sslDaysLeft: Math.round((expiresAt.getTime() - Date.now()) / DAY_MS),
      })
    })
  })
}

module.exports = { checkSsl }
