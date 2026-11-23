// DNS check (Part 3) — resolve4(host) with a 5s timeout.
// Returns { dnsOk, upstreamHosts } where upstreamHosts = { hosts: [host], addresses: [...] }.

const dns = require('dns').promises

const TIMEOUT_MS = 5000

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('DNS timeout')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function checkDns(host) {
  try {
    const addresses = await withTimeout(dns.resolve4(host), TIMEOUT_MS)
    return { dnsOk: addresses.length > 0, upstreamHosts: { hosts: [host], addresses } }
  } catch (e) {
    return { dnsOk: false, upstreamHosts: { hosts: [host], addresses: [], error: e.code || e.message } }
  }
}

module.exports = { checkDns }
