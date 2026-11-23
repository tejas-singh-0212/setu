// Mock data — canonical fallback data (flagged // MOCK — remove at API parity)
// Mirrors context.md §7 canonical demo data

export const mockUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'sarah.chen@example.com',
  name: 'Sarah Chen',
  avatarUrl: null,
  provider: 'google',
}

export const mockMonitors = [
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'REST Countries API',
    type: 'api',
    url: 'https://restcountries.com/v3.1/all?fields=name,capital,currencies,region,population,area,flag',
    method: 'GET',
    intervalSec: 60,
    status: 'active',
    healthScore: 71,
    lastProbedAt: new Date(Date.now() - 18000).toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'JSONPlaceholder',
    type: 'api',
    url: 'https://jsonplaceholder.typicode.com',
    method: 'GET',
    intervalSec: 60,
    status: 'active',
    healthScore: 82,
    lastProbedAt: new Date(Date.now() - 34000).toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Open-Meteo Site',
    type: 'website',
    url: 'https://open-meteo.com',
    method: 'GET',
    intervalSec: 300,
    status: 'active',
    healthScore: 99,
    lastProbedAt: new Date(Date.now() - 12000).toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    name: 'Wikipedia',
    type: 'website',
    url: 'https://www.wikipedia.org',
    method: 'GET',
    intervalSec: 300,
    status: 'active',
    healthScore: 98,
    lastProbedAt: new Date(Date.now() - 9000).toISOString(),
  },
]

export const mockHealth = {
  monitorCount: { total: 4, api: 2, website: 2 },
  openIncidents: 2,
  avgHealthScore: 88,
  avgResponseTime: 312,
  dependencyWarningCount: 2,
  recentIncidents: [
    {
      id: '00000000-0000-0000-0000-000000000006',
      title: 'Schema drift detected on REST Countries API',
      type: 'drift',
      severity: 'high',
      status: 'open',
      monitorName: 'REST Countries API',
      time: '2m ago',
      probableCause: 'Upstream renamed capital field and removed flag',
    },
    {
      id: '00000000-0000-0000-0000-000000000007',
      title: 'High latency on JSONPlaceholder',
      type: 'latency',
      severity: 'medium',
      status: 'recovering',
      monitorName: 'JSONPlaceholder',
      time: '1h ago',
      probableCause: '3 consecutive calls >1000ms',
    },
  ],
}

export const mockIncidents = [
  {
    id: '00000000-0000-0000-0000-000000000006',
    title: 'Schema drift detected on REST Countries API',
    type: 'drift',
    severity: 'high',
    status: 'open',
    monitorName: 'REST Countries API',
    time: '2m ago',
    probableCause: 'Upstream renamed capital field and removed flag',
  },
  {
    id: '00000000-0000-0000-0000-000000000007',
    title: 'High latency on JSONPlaceholder',
    type: 'latency',
    severity: 'medium',
    status: 'recovering',
    monitorName: 'JSONPlaceholder',
    time: '1h ago',
    probableCause: '3 consecutive calls >1000ms',
  },
]

export const mockDependencies = [
  'restcountries.com — SSL expires in 12 days',
  'jsonplaceholder.typicode.com — rate limit approaching',
]

export const mockProbes = []

export const mockSettings = {
  latencyThresholdMs: 1000,
  consecutiveSlow: 3,
  maxRecoveryPerHour: 3,
  requireApproval: true,
  dryRunDefault: true,
  probeIntervalDefault: 60,
  ragEnabled: true,
}
