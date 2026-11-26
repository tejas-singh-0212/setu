// Network guard (SSRF) — shared by monitor creation and every outbound probe.
//
// Checking a URL once at creation is not enough: a public URL can redirect to
// an internal address, and a hostname can be re-pointed at one later (DNS
// rebinding). So every outbound connection resolves the host through
// guardedLookup, which refuses private/loopback/link-local/metadata addresses
// at connect time, and safeFetch re-validates every redirect hop.

const dns = require('dns')
const net = require('net')
const http = require('http')
const https = require('https')

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 10) return true // 10.0.0.0/8
    if (a === 127) return true // loopback
    if (a === 0) return true
    if (a === 169 && b === 254) return true // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
    if (a >= 224) return true // multicast + reserved
    return false
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true
    if (v.startsWith('fc') || v.startsWith('fd')) return true // ULA
    if (v.startsWith('fe80')) return true // link-local
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIp(mapped[1])
    return false
  }
  return false
}

function blockedError(host) {
  const e = new Error(`Blocked request to private or metadata address (${host})`)
  e.code = 'EBLOCKED'
  return e
}

// Drop-in replacement for dns.lookup (http/https/tls `lookup` option).
function guardedLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  if (typeof options === 'number') options = { family: options }
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err)
    if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) {
      return callback(blockedError(hostname))
    }
    if (options.all) return callback(null, addresses)
    callback(null, addresses[0].address, addresses[0].family)
  })
}

// Literal IP hosts skip `lookup` entirely, so they are checked up front.
function assertHostAllowed(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (net.isIP(host) && isPrivateIp(host)) throw blockedError(host)
}

const REDIRECTS = new Set([301, 302, 303, 307, 308])

// safeFetch(url, { method, timeoutMs, readBody, maxBytes, maxRedirects })
// → { status, url, headersAt, body } where body is a string when readBody is
// set and the response fits in maxBytes, otherwise null.
// The timeout covers the whole exchange, redirects and body included.
function safeFetch(rawUrl, opts = {}) {
  const {
    method = 'GET',
    timeoutMs = 5000,
    readBody = false,
    maxBytes = 1024 * 1024,
    maxRedirects = 5,
  } = opts

  return new Promise((resolve, reject) => {
    let settled = false
    let currentReq = null
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }
    const timer = setTimeout(() => {
      if (currentReq) currentReq.destroy()
      const e = new Error(`Request timed out after ${timeoutMs}ms`)
      e.name = 'AbortError'
      finish(reject, e)
    }, timeoutMs)

    const go = (urlString, verb, hopsLeft) => {
      let u
      try {
        u = new URL(urlString)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`Unsupported protocol ${u.protocol}`)
        assertHostAllowed(u.hostname)
      } catch (e) {
        return finish(reject, e)
      }

      const lib = u.protocol === 'https:' ? https : http
      const req = lib.request(
        u,
        {
          method: verb,
          lookup: guardedLookup,
          headers: { 'User-Agent': 'Setu-Monitor/1.0', Accept: '*/*' },
        },
        (res) => {
          const status = res.statusCode
          if (REDIRECTS.has(status) && res.headers.location) {
            res.resume()
            if (hopsLeft <= 0) return finish(reject, new Error('Too many redirects'))
            let next
            try {
              next = new URL(res.headers.location, u).toString()
            } catch {
              return finish(reject, new Error('Invalid redirect location'))
            }
            const nextVerb = status === 303 || ((status === 301 || status === 302) && verb === 'POST') ? 'GET' : verb
            return go(next, nextVerb, hopsLeft - 1)
          }

          const headersAt = Date.now()
          if (!readBody) {
            res.destroy()
            return finish(resolve, { status, url: u.toString(), headersAt, body: null })
          }

          const chunks = []
          let size = 0
          res.on('data', (chunk) => {
            size += chunk.length
            if (size > maxBytes) {
              res.destroy()
              finish(resolve, { status, url: u.toString(), headersAt, body: null })
              return
            }
            chunks.push(chunk)
          })
          res.on('end', () => finish(resolve, { status, url: u.toString(), headersAt, body: Buffer.concat(chunks).toString('utf8') }))
          res.on('error', (e) => finish(reject, e))
        }
      )
      currentReq = req
      req.on('error', (e) => finish(reject, e))
      req.end()
    }

    go(rawUrl, String(method).toUpperCase(), maxRedirects)
  })
}

module.exports = { isPrivateIp, guardedLookup, assertHostAllowed, safeFetch }
