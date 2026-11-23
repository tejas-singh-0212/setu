// Dependency Health — context.md §5.8 (Part 3). New screen (no v1 file).

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout, StatCard, Pill, Skeleton, ErrorState, EmptyState } from '../components'
import { get, post } from '../lib/api'

const hostOf = (url) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function ExpiryChip({ days, warnDays }) {
  if (days === null || days === undefined) return <Pill variant="neutral">Unknown</Pill>
  if (days < 0) return <Pill variant="bad">Expired</Pill>
  const label = `${days} day${days === 1 ? '' : 's'}`
  if (days <= 3) return <Pill variant="bad">{label}</Pill>
  if (days <= warnDays) return <Pill variant="warn">{label}</Pill>
  return <Pill variant="ok">{label}</Pill>
}

export default function Dependencies() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState({}) // monitorId → true
  const [rowErrors, setRowErrors] = useState({}) // monitorId → message
  const [reminding, setReminding] = useState(false)
  const [remindError, setRemindError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await get('/api/dependencies'))
    } catch (e) {
      setError(e)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const runCheck = async (monitorId) => {
    setRunning((r) => ({ ...r, [monitorId]: true }))
    setRowErrors((r) => ({ ...r, [monitorId]: null }))
    try {
      await post(`/api/dependencies/${monitorId}/check`)
      await load() // refresh row, counters and banner together
    } catch (e) {
      setRowErrors((r) => ({ ...r, [monitorId]: 'Check failed — try again.' }))
    } finally {
      setRunning((r) => ({ ...r, [monitorId]: false }))
    }
  }

  if (error) return <AppLayout dataPage="dependencies"><ErrorState onRetry={load} /></AppLayout>
  if (!data) {
    return (
      <AppLayout dataPage="dependencies">
        <div className="space-y-6">
          <Skeleton lines={2} width="40%" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} type="card" />)}</div>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} type="tableRow" />)}
        </div>
      </AppLayout>
    )
  }
  if (!data.items.length) {
    return (
      <AppLayout dataPage="dependencies">
        <EmptyState title="No monitors yet" description="Add a monitor to start checking DNS and certificates." actionLabel="Add Monitor" onAction={() => navigate('/onboarding')} />
      </AppLayout>
    )
  }

  const { items, stats, sslWarnDays } = data
  // Worst (soonest) expiring certificate within the warning window drives the banner.
  const expiring = items
    .filter((c) => c.sslDaysLeft !== null && c.sslDaysLeft <= sslWarnDays)
    .sort((a, b) => a.sslDaysLeft - b.sslDaysLeft)[0]

  const createReminder = async () => {
    const host = hostOf(expiring.url)
    setReminding(true)
    setRemindError(null)
    try {
      await post('/api/dependencies/remind', {
        monitorId: expiring.monitorId,
        title: `Renew SSL certificate for ${host}`,
        why: `Expires in ${expiring.sslDaysLeft} days (from dependencies)`,
      })
      navigate('/recommendations')
    } catch (e) {
      setRemindError('Could not create the recommendation — try again.')
      setReminding(false)
    }
  }

  return (
    <AppLayout dataPage="dependencies">
      <div className="space-y-6 pb-12">
        <section>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-ink">Dependency Health</h1>
          <p className="text-sm text-muted mt-1">DNS, certificates and upstreams for every monitor</p>
        </section>

        {expiring && (
          <section className="card !p-5 border-warn/40 bg-warn/5" role="alert">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <p className="flex-1 text-sm font-medium text-ink">
                ⚠ {hostOf(expiring.url)} certificate {expiring.sslDaysLeft < 0 ? 'has expired' : `expires in ${expiring.sslDaysLeft} days`} — renew to avoid outage.
              </p>
              <div className="flex flex-col items-start md:items-end gap-1">
                <button type="button" className="btn-primary disabled:opacity-50" onClick={createReminder} disabled={reminding}>
                  {reminding ? 'Creating…' : 'Create reminder recommendation'}
                </button>
                {remindError && <span className="text-xs text-bad" role="alert">{remindError}</span>}
              </div>
            </div>
          </section>
        )}

        <section aria-label="Dependency check statistics" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="CHECKS TODAY" value={stats.checksToday} />
          <StatCard label="FAILURES" value={stats.failuresToday}>
            <Pill variant={stats.failuresToday ? 'bad' : 'ok'}>{stats.failuresToday ? '● Needs attention' : '● All passing'}</Pill>
          </StatCard>
          <StatCard label="NEXT EXPIRY" value={stats.nextExpiryDays === null ? '—' : `${stats.nextExpiryDays}d`}>
            {stats.nextExpiryDays !== null && stats.nextExpiryDays <= sslWarnDays && <Pill variant="warn">Within {sslWarnDays} days</Pill>}
          </StatCard>
        </section>

        <section className="card !p-0 overflow-hidden" aria-labelledby="deps-title">
          <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-200">
            <h2 id="deps-title" className="text-lg font-semibold text-ink">Dependency checks</h2>
            <Pill variant={data.warnings ? 'warn' : 'ok'}>{data.warnings} warning{data.warnings === 1 ? '' : 's'}</Pill>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base !border-0">
              <thead>
                <tr>
                  <th scope="col">MONITOR</th>
                  <th scope="col">DNS</th>
                  <th scope="col">SSL ISSUER</th>
                  <th scope="col">EXPIRES</th>
                  <th scope="col">UPSTREAM HOSTS</th>
                  <th scope="col">RATE LIMIT</th>
                  <th scope="col">ACTION</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {items.map((c) => (
                  <tr key={c.monitorId}>
                    <td>
                      <p className="font-semibold text-ink">{c.monitorName}</p>
                      <p className="text-xs text-muted">
                        {c.at ? `Checked ${new Date(c.at).toLocaleString()}` : 'Never checked'}
                      </p>
                    </td>
                    <td>
                      {!c.id ? <Pill variant="neutral">Pending</Pill> : c.dnsOk ? <Pill variant="ok">✓ Resolved</Pill> : <Pill variant="bad">✗ Failed</Pill>}
                    </td>
                    <td>{c.sslIssuer || <span className="text-muted">—</span>}</td>
                    <td>{c.id ? <ExpiryChip days={c.sslDaysLeft} warnDays={sslWarnDays} /> : <span className="text-muted">—</span>}</td>
                    <td className="font-mono text-xs">{c.upstreamHosts.length ? c.upstreamHosts.join(', ') : hostOf(c.url)}</td>
                    <td>{!c.id ? <span className="text-muted">—</span> : c.rateLimited ? <Pill variant="warn">Throttled</Pill> : <Pill variant="ok">OK</Pill>}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-secondary !py-1.5 !px-3 !text-xs disabled:opacity-50"
                        onClick={() => runCheck(c.monitorId)}
                        disabled={running[c.monitorId]}
                      >
                        {running[c.monitorId] ? 'Checking…' : 'Run check'}
                      </button>
                      {rowErrors[c.monitorId] && <p className="text-xs text-bad mt-1" role="alert">{rowErrors[c.monitorId]}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  )
}
