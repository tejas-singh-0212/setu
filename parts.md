# Setu Work Parts (briefs for coding agents)

> **How to use:** hand an agent this whole file + `context.md`. The agent works **only inside its own part**. JavaScript everywhere. All three parts run **in parallel** — the contracts below keep files conflict-free.

---

## Shared contracts (every part must follow)

**Rule of ownership:** You may **import/require** any file in the repo. You may **EDIT/CREATE only** the files listed in your part. Never touch another part's files — not even a typo fix.

**C1 — Server route auto-mount** (`server/src/index.js`, created by Part 1):
any file `server/src/routes/<name>.js` that exports an Express router is automatically mounted at `/api/<name>`. You never edit `index.js`; you only create your route files.

**C2 — Hook loaders** (created by Part 1; you only drop files in):
- `server/src/hooks/afterProbe/*.js` → `module.exports = { name, run: async (ctx) => {} }` — runs after every probe. `ctx = { monitor, probe, payload, pool }`.
- `server/src/hooks/scheduled/*.js` → `module.exports = { name, intervalMs, run: async () => {} }` — started by the probe scheduler.

**C3 — Client page contract** (`client/src/App.jsx`, created by Part 1, contains a lazy route map for **all** routes below). Create your pages with these **exact filenames**, default-exported React components:

| File | Route | `data-page` | Owner |
|---|---|---|---|
| `pages/Login.jsx` | `/login` | `login` (no shell) | Part 1 |
| `pages/Onboarding.jsx` | `/onboarding` | `onboarding` (no shell) | Part 1 |
| `pages/Dashboard.jsx` | `/`, `/dashboard` | `dashboard` | Part 1 |
| `pages/Monitors.jsx` | `/monitors` | `monitors` | Part 1 |
| `pages/UIStates.jsx` | `/states` | `states` | Part 1 |
| `pages/Incidents.jsx` | `/incidents` | `incidents` | Part 2 |
| `pages/DiffApproval.jsx` | `/diff` | `diff` (active nav = incidents) | Part 2 |
| `pages/Recommendations.jsx` | `/recommendations` | `recommendations` | Part 2 |
| `pages/Telemetry.jsx` | `/telemetry` | `telemetry` | Part 3 |
| `pages/Dependencies.jsx` | `/dependencies` | `dependencies` | Part 3 |
| `pages/History.jsx` | `/history` | `history` | Part 3 |
| `pages/Settings.jsx` | `/settings` | `settings` | Part 3 |

`App.jsx` uses `React.lazy` imports — a missing page fails only when its route is opened, so the app boots after any single part merges; it is **fully** working after all three merge.

**C4 — API surface:** base contract = `context.md` §6. Amendments (parts.md wins on ownership):
- `GET /api/telemetry?range=` → Part 3 (`routes/telemetry.js`)
- `GET /api/history` (schema versions/snapshots + audit for the History page) and `POST /api/history/rollback/:versionId` → Part 3 (`routes/history.js`)
- `GET /api/llm/status` → Part 2 (`routes/llm.js`) — consumed by Part 3's Settings page

**C5 — Database:** `setup-db.sql` (repo root) is the single source of truth — created once by **Part 1 with ALL tables** (listed below), applied via the Supabase SQL Editor. Parts 2/3 read/write via raw `pg` (`server/src/lib/db.js` → `query`/`execute`) — **never edit the schema or seed**. If you think a field is missing, use an existing Json column (e.g. `payload`) — do not alter the schema. pgvector embeddings are inserted by `server/scripts/seed.js` (`npm run seed`).

**C6 — Safety invariant:** recovery execution must check (in order): safety limits from `Setting` rows → approval status → execute → post-check. No code path may bypass approval while `requireApproval = true`. (Owned by Part 2's recovery service; everyone respects it.)

**C7 — Style:** Tailwind tokens + `components.css` classes only (no new colors/fonts). Loading/error/empty states on every screen. Canonical data only (`context.md` §7).

---

## Part 1 — Foundation & Monitoring

**Mission:** the runnable skeleton — DB schema, seed, auth, monitoring pipeline, client foundation, and the first five screens. Everything else plugs into what you build.

### Files you own (create these only)
```
server/package.json · server/.env.example
server/src/index.js
server/src/lib/db.js
server/src/middleware/auth.js · server/src/middleware/errorHandler.js
server/src/routes/auth.js · monitors.js · probes.js · health.js
server/src/services/monitors.js · probes.js · probeScheduler.js · anomaly.js
server/src/hooks/README.md            (docs only — no hook logic)
setup-db.sql · server/scripts/seed.js
client/package.json · client/vite.config.js · client/index.html
client/src/main.jsx · client/src/App.jsx
client/src/styles/tailwind.config.js · components.css · index.css
client/src/lib/api.js
client/src/components/: AppLayout, Sidebar, Topbar, RequireAuth, StatCard,
  Pill, DataTable, Modal, Overlay, Skeleton, ErrorState, EmptyState
client/src/pages/: Login.jsx, Onboarding.jsx, Dashboard.jsx, Monitors.jsx, UIStates.jsx
```

### Never edit
Anything under `server/src/routes/{incidents,recovery,recommendations,llm,telemetry,dependencies,reports,settings,history}.js`, `server/src/services/` (except your four), `server/src/hooks/afterProbe/*`, `server/src/hooks/scheduled/*`, or `client/src/pages/` (other than your five).

### Work items

**A. Server bootstrap**
1. `index.js`: Express on `PORT` (4000) · JSON body · `connect-pg-simple` session store (`SESSION_SECRET`) · `CLIENT_URL` CORS with credentials · **C1 route loader** (readdir `routes/`, mount each file at `/api/<name>`) · **C2 hook loaders** for `hooks/afterProbe/*` and `hooks/scheduled/*` · `errorHandler` middleware last · `GET /api/ping`.
2. `lib/db.js`: `pg` Pool singleton + `query(text, params)` / `execute(text, params)` helpers.
3. `middleware/auth.js`: `requireAuth` (401 JSON if no `req.session.userId`); Passport strategies **Google + GitHub** (profile → upsert `User` → `req.session.userId`); helpers `loginUser`, `logoutUser`.
4. `.env.example`: `DATABASE_URL, SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, LLM_API_URL, LLM_API_KEY, CLIENT_URL, PORT`.

**B. Full SQL schema** (`setup-db.sql` — tables + required fields, all three parts depend on these; run `CREATE EXTENSION IF NOT EXISTS vector;` first):
- **User**: id, email(unique), name, avatarUrl, provider, providerId, createdAt
- **Monitor**: id, userId, name, type(`website|api`), url, method(default GET), intervalSec, timeoutMs, retries, cacheEnabled, status(`active|paused`), healthScore, lastProbedAt, createdAt
- **Probe**: id, monitorId, at, ok, statusCode, latencyMs, schemaOk(Boolean?), error(String?), dnsOk(Boolean?), sslDaysLeft(Int?)
- **Incident**: id, monitorId, type(`drift|latency|error|dependency`), severity, title, probableCause, status(`open|diagnosing|recovering|resolved|failed`), diagnosis(Json?), openedAt, closedAt
- **IncidentEvent**: id, incidentId, at, kind(`detected|diagnosis|proposed|approved|rejected|executed|postcheck|note`), actor, payload(Json)
- **RecoveryAction**: id, incidentId, kind(`timeout|retry|cache|mapping_rollback|transform`), payload(Json), status(`pending|approved|rejected|executed|verified|failed`), proposedBy, approvedBy, executedAt, postCheckOk(Boolean?)
- **DependencyCheck**: id, monitorId, at, dnsOk, sslIssuer, sslExpiresAt, sslDaysLeft, upstreamHosts(Json), rateLimited(Boolean)
- **Recommendation**: id, monitorId?, title, why, action(Json), source, status(`open|applied|dismissed`), createdAt
- **SchemaVersion**: id, monitorId, version, schemaJson(Json), status(`expected|superseded`), createdAt
- **ChangeEvent**: id, monitorId, oldSchemaId, newSchemaId, changeType(`renamed|removed|type_changed`), detectedAt, status
- **MappingFix**: id, changeId, fixCode, proposedBy, approvedBy, approvedAt, status
- **AuditLog**: id, entityType, entityId, action, actor, timestamp, payload(Json)
- **Setting**: key(String @id), value(Json)
- **Embedding**: id, kind, refId?, content, vector — column type `vector(384)` (pgvector). The extension is created by `setup-db.sql`; embeddings are seeded by `server/scripts/seed.js`.

**C. Seed (`setup-db.sql` data section + `server/scripts/seed.js` for embeddings)** — reproduces `context.md` §7 completely, all three parts read this data:
- 1 demo User (Sarah Chen, provider google) · Settings defaults: `latencyThresholdMs:1000, consecutiveSlow:3, maxRecoveryPerHour:3, requireApproval:true, dryRunDefault:true, probeIntervalDefault:60, ragEnabled:true`
- 4 Monitors exactly as `context.md` §5.3 (REST Countries API w/ timeoutMs 5000, retries 0, cacheEnabled false; JSONPlaceholder w/ retries 0; the two websites)
- ~100 Probes per monitor over last 24h (realistic latencies; JSONPlaceholder includes 1,480ms spike cluster)
- 4 Incidents + IncidentEvents exactly as `context.md` §5.5 (drift one has `diagnosis` Json already filled)
- SchemaVersion pair (v1.1 expected / v1.2 detected) for REST Countries + ChangeEvent + one pending MappingFix (fixCode with `capital→capital_city`, `population` coercion)
- 4 Recommendations as `context.md` §5.9 · DependencyCheck rows (restcountries.com sslDaysLeft 12, others ~84) · AuditLog rows for the resolved incident · ≥5 Embedding rows (kind `knowledge`, deterministic 384-dim arrays) so RAG index is non-zero

**D. Route files**
- `routes/auth.js` → `GET /google`, `GET /github` (Passport redirects), `GET /google/callback`, `GET /github/callback`, `GET /me`, `POST /logout`
- `routes/monitors.js` → `GET /`, `POST /` (validate url/type → create), `PATCH /:id` (pause/edit/interval), `DELETE /:id`, `POST /:id/probe` (run one probe now)
- `routes/probes.js` → `GET /?monitor=&range=` (probe history for charts)
- `routes/health.js` → `GET /` aggregate: monitorCount (by type), openIncidents, avgHealthScore, avgResponseTime, recentIncidents (6, shape: id/title/type/severity/status/monitorName/time/probableCause), dependencyWarningCount

**E. Services**
- `services/monitors.js` — CRUD logic used by routes
- `services/probes.js` — `runProbe(monitor)`: website → GET (status, latency, follow redirects); api → GET/POST (status, latency); checks reachability; writes `Probe`; runs **all `hooks/afterProbe/*`** with `ctx`; then calls `anomaly.evaluate(probe)`
- `services/probeScheduler.js` — `node-cron` per monitor `intervalSec`; starts all `hooks/scheduled/*` by their `intervalMs`
- `services/anomaly.js` — `evaluate(probe)`: latency > `Setting.latencyThresholdMs` (or N consecutive) → create `Incident(type:latency)` if none open + `IncidentEvent(detected)`; 5xx burst (≥3 in 5 min) → `Incident(type:error)`; updates monitor `healthScore` (100 minus penalties)

**F. Client foundation**
1. Vite + React18, `vite.config.js` proxy `/api → http://localhost:4000`
2. `styles/tailwind.config.js` = tokens from `context.md` §4; `components.css` = port v1 classes (`.btn-*`, `.card`, `.pill-*`, `.badge-count`, `.table-base`, `.input-base`, `.overlay`); `index.css` = Inter font import
3. `lib/api.js` = `get/post/put/patch/del` with `credentials:'include'` + JSON + throw on !ok; auto-prefixes `/api`; no mock layer — canonical numbers live in the `setup-db.sql` seed
4. `components/` kit (used by ALL pages):
   - `AppLayout` — renders Sidebar+Topbar+`<main class="ml-64 pt-14 p-6">`, props `{dataPage, children}`; if `dataPage` is `login|onboarding` render children full-bleed (no shell)
   - `Sidebar` — **8 nav items exactly as `context.md` §4** (Dashboard, Monitors, Incidents+badge, Telemetry, Dependencies, Recommendations, History & Reports, Settings), active from `dataPage` (`diff`→active incidents, `states`→active dashboard), links to the 12 routes in C3, bottom: live status + user card (from `GET /api/auth/me`)
   - `Topbar` — as v1 (Setu Studio, search, Healthy pill, production/staging, bell, Feedback; display-only)
   - `RequireAuth` — wraps protected routes; `GET /api/auth/me` 401 → redirect `/login`
   - `StatCard, Pill, DataTable, Modal (ports v1 overlay open/close), Overlay, Skeleton, ErrorState, EmptyState`
5. `App.jsx` — `createBrowserRouter` with **all 12 lazy page entries from C3** + `<RequireAuth>` on everything except `/login`, `/onboarding`, `/states`
6. `main.jsx`, `index.html` (title "Setu")

**G. Your five pages** (spec = `context.md` §5.X, all data from your API):
- **Login** (§5.1) — Google/GitHub buttons hit `/api/auth/google|github`
- **Onboarding** (§5.2) — `POST /api/monitors` → navigate `/dashboard`
- **Dashboard** (§5.3) — `GET /api/health` + `GET /api/monitors`; all actions wired per `guide.md` §7
- **Monitors** (§5.4) — `GET /api/monitors`, pause/edit via `PATCH`
- **UIStates** (§5.12) — empty (when `GET /api/monitors` returns []), loading, error patterns

### Definition of done
- [ ] `npm run dev` (server) + `npm run dev` (client) boots; login with GitHub **or** Google works locally
- [ ] `setup-db.sql` runs clean (idempotent) on a fresh Supabase pgvector DB; `npm run seed` inserts embeddings; all seed rows from context.md §7 present
- [ ] Route loader mounts ≥5 routers without editing `index.js` again; hook loader runs a sample hook
- [ ] 5 pages render with real API data; protected routes redirect when logged out
- [ ] Another part can: create `routes/incidents.js` and reach it at `/api/incidents`; drop `hooks/afterProbe/schemaDiff.js` and see it execute after a probe; create `pages/Telemetry.jsx` and have `/telemetry` work — **verify with a dummy file, then delete it**

---

## Part 2 — Incidents & Intelligence

**Mission:** the brain — drift detection, diagnosis (rules + LLM + RAG), the approval-gated recovery engine, and recommendations. Your three screens carry the demo story.

### Files you own (create these only)
```
server/src/routes/incidents.js · recovery.js · recommendations.js · llm.js
server/src/services/llm.js · rag.js · diagnosis.js · recovery.js · recommendations.js · schemaDiff.js
server/src/hooks/afterProbe/schemaDiff.js
client/src/pages/Incidents.jsx · DiffApproval.jsx · Recommendations.jsx
```

### Never edit
Part 1/Part 3 files — especially `setup-db.sql`, `seed.js`, `index.js`, `App.jsx`, `components/*`. You may `require('../lib/db')`, `require('../services/probes')`, import components, and read `Setting` rows.

### Work items

**A. Drift detection hook**
1. `hooks/afterProbe/schemaDiff.js` — if `monitor.type !== 'api'` skip. Load expected schema (`SchemaVersion status:expected` for monitor). Extract a JSON Schema from the response (infer types/required/keys). Diff → classify each change `renamed|removed|type_changed` (similarity: type + name proximity + position). On any change: upsert detected `SchemaVersion`, create `ChangeEvent`, create `Incident(type:drift, severity:high, probableCause:"<short line>", status:open)` + `IncidentEvent(detected)` — **only if no open drift incident exists for that monitor** (idempotent per probe).

**B. Route files** (auto-mounted via C1)
- `routes/incidents.js`:
  - `GET /` — filters (type/status/range) + join monitor name; shape per `context.md` §5.5
  - `GET /:id` — incident + monitor + `IncidentEvent[]` + (if drift) `ChangeEvent`, both `SchemaVersion`s, pending `RecoveryAction`s, and: if `diagnosis` is null → run `diagnosisService.diagnose(incident)` (rules only if LLM down), store, return
- `routes/recovery.js`:
  - `POST /` body `{incidentId, kind, payload}` → safety pre-check (rate: count executed `RecoveryAction` in last hour `< Setting.maxRecoveryPerHour`; else 429) → create `RecoveryAction(status:pending)` + `IncidentEvent(proposed)` + `AuditLog`
  - `POST /:id/approve` — **C6 order:** verify pending → status approved → execute (A) → `IncidentEvent(approved+executed)` + `AuditLog(action:'recovery.execute')` → schedule post-check (B)
  - `POST /:id/reject` — status rejected + events/audit; incident → `diagnosing` (or resolved if user closes)
  - `POST /:id/verify` — run `probes.runProbe(monitor)` as post-check → `postCheckOk` → status `verified|failed` → incident `resolved|failed` + `IncidentEvent(postcheck)` + `AuditLog`
  - Safety: if `Setting.requireApproval` is true, execute **only** via approve — never from `POST /`
- `routes/recommendations.js` — `GET /`, `POST /:id/apply` (creates pending `RecoveryAction` from `recommendation.action`, status open→applied, returns action for approval flow), `POST /:id/dismiss`
- `routes/llm.js` — `GET /status` → `{model: process.env.LLM_API_URL ? 'Llama 3.3 (free inference API)' : null, endpoint: 'configured', ragCount: count from the embedding table}` (no secrets in response)

**C. Services**
- `services/llm.js` — one client: `chat(system, user)` → POST `LLM_API_URL` (OpenAI-compatible `/chat/completions`) with `LLM_API_KEY` if set; **10s timeout**; on failure throw `LlmUnavailable` (callers fall back to rules — never fail the request)
- `services/rag.js` — `embed(text)` (same provider or local deterministic hash-embedding fallback 384-dim) · `retrieve(query, k=4)` → pgvector similarity: `SELECT … ORDER BY vector <=> $1 LIMIT k` via `$queryRawUnsafe` with parameter binding · `index(kind, refId, content)` upsert
- `services/diagnosis.js` — rules pass first (drift→"upstream schema change on X"; latency→"third-party slowness or payload growth"; error→"5xx burst"; dependency→"cert/DNS") → augment: `rag.retrieve(title + cause)` → build prompt → `llm.chat` for a 2-sentence probable cause + confidence → store `Incident.diagnosis` (Json: `{summary, confidence, ragUsed, rules}`) + `IncidentEvent(diagnosis)`; llm fail → rules-only diagnosis
- `services/recovery.js` — execute by kind: `timeout|retry|cache` → update that Monitor's `timeoutMs|retries|cacheEnabled` · `transform|mapping_rollback` → apply/rollback MappingFix (flip SchemaVersion status) · then write AuditLog; **all guard checks live here** (called by routes) · `postCheck(monitor)` → `probes.runProbe`
- `services/recommendations.js` — build the 4 canonical recommendations from seed/telemetry queries (if table empty); `apply` logic shared with routes
- `services/schemaDiff.js` — pure diff/classify logic used by the hook (easier to test)

**D. Your three pages** (spec `context.md` §5.X; fetch via `lib/api`):
- **Incidents** (§5.5) — table from `GET /api/incidents`; non-drift rows expand inline (timeline from `GET /api/incidents/:id`, Diagnosis panel, recovery buttons: `POST /api/recovery` → approval modal → `approve` → `verify`); drift rows → `/diff`
- **DiffApproval** (§5.6) — v1 diff layout **plus** Root Cause card (from `diagnosis`) **plus** Suggested recovery actions (3 options with safety chips) → `POST /api/recovery` → Confirm overlay → `approve` → `verify` → success → `/history`; Reject → `POST` reject → `/incidents`; keep rollback-point link → `/history`
- **Recommendations** (§5.9) — cards from `GET /api/recommendations`; Apply → same recovery+approval flow; Dismiss → `POST /:id/dismiss`

### Definition of done
- [ ] New probe on the REST Countries monitor with a changed field creates a drift incident within one probe cycle (test with a mock/edited response)
- [ ] `GET /api/incidents/:id` returns a diagnosis (rules-only works with `LLM_API_URL` unset)
- [ ] Recovery: `POST /` alone executes **nothing**; approve → execute → verify chain writes IncidentEvents + AuditLog; reject path tested
- [ ] Rate limit returns 429 past `maxRecoveryPerHour`
- [ ] 3 pages wired per guide §7; RAG badge shows real `ragCount` from `/api/llm/status`
- [ ] No edits outside your file list (verify with `git status`)

---

## Part 3 — Operations & Reporting

**Mission:** day-2 operations — telemetry charts, dependency health, the history/rollback + reports screen (incl. the 91% vs 64% comparison), and settings.

### Files you own (create these only)
```
server/src/routes/telemetry.js · dependencies.js · reports.js · settings.js · history.js
server/src/services/telemetry.js · reports.js · settings.js
server/src/services/checks/dns.js · checks/ssl.js
server/src/hooks/scheduled/dependencyChecks.js
client/src/pages/Telemetry.jsx · Dependencies.jsx · History.jsx · Settings.jsx
```

### Never edit
Part 1/Part 2 files. You may import the `pg` pool (`lib/db`), `probes` service, components, and read all tables.

### Work items

**A. Route files** (auto-mounted via C1)
- `routes/telemetry.js` — `GET /?range=1h|6h|24h|7d` from `GET /api/telemetry` contract (C4): `{stats:{p50,p99,slaBreaches,errorRate}, curve:[{t, p99, breached}], slowCalls:[…last 50 >800ms from probes], alert:{active, consecutive, threshold}}` — computed from `Probe` rows (p50/p99 = sorted percentiles; breaches = probes over `Setting.latencyThresholdMs`; errorRate = failed/total)
- `routes/dependencies.js` — `GET /` (latest `DependencyCheck` per monitor + warning count) · `POST /:monitorId/check` (run dns+ssl now, write row, return) · `POST /remind` body `{monitorId, title, why}` → create `Recommendation(source:'dependency')` → returns it
- `routes/reports.js` — `GET /?range=7d|30d|90d`: `{stats:{incidents, autoRecovered, manualApprovals, mttrMinutes}, effectiveness:{intelligent, static}, history:[…incident rows with diagnosis/action/postCheck/duration]}` — **effectiveness:** intelligent = `verified / executed` recovery actions %, static = baseline 64% constant documented as "static rules benchmark" (seeded); MTTR = avg(`closedAt - openedAt`) over resolved incidents; if closedAt null exclude
- `routes/settings.js` — `GET /` (all `Setting` rows + `{llmStatus}` left to client via C4) · `PUT /` body whitelisted keys only: `latencyThresholdMs, consecutiveSlow, maxRecoveryPerHour, probeIntervalDefault, ragEnabled` (`requireApproval` & `dryRunDefault` are **read-only true** for demo — reject attempts to flip) → upsert `Setting` + `AuditLog(action:'settings.update')`
- `routes/history.js` — `GET /` → `{versions:[SchemaVersion+ChangeEvent summary for monitors], audit:[last 50 AuditLog with actor]}` · `POST /rollback/:versionId` → set target `SchemaVersion` expected + others superseded + `AuditLog(action:'schema.rollback')` + returns updated row (approval UI is client-side confirm overlay)

**B. Services**
- `services/checks/dns.js` — `dns.resolve4(host)` → `{dnsOk, upstreamHosts}` (timeout 5s, fail → dnsOk false)
- `services/checks/ssl.js` — `tls.connect({host, port:443, rejectUnauthorized:false})` → issuer, `valid_to` → `sslDaysLeft` (round); fail → nulls + `dnsOk` unchanged
- `hooks/scheduled/dependencyChecks.js` — `{name:'dependency-checks', intervalMs:3600000, run:}` for each active monitor: run dns+ssl → upsert `DependencyCheck` → if `sslDaysLeft <= 14` and no open dependency incident → create `Incident(type:dependency, probableCause:'SSL cert expires in N days')` + event
- `services/telemetry.js` — percentile/curve builders used by routes (pure functions)
- `services/reports.js` — aggregation queries used by routes
- `services/settings.js` — get/upsert helpers + whitelist (used by routes; also export `getSetting(key)` so anyone can read — you own the canonical reader)

**C. Your four pages** (spec `context.md` §5.X):
- **Telemetry** (§5.7) — `GET /api/telemetry?range=24h`; keep v1 layout: 4 stat cards, SVG curve (threshold line + breach markers + tooltip), Active Alert + 3 remedy cards (Configure → `/settings`, Apply Remedy → recovery flow via `POST /api/recovery` with kind `retry|timeout|cache` — reuse Part 2's endpoint, approval modal can be a simple confirm then `approve`+`verify`), slow-call table (View Details → row expand, no nav)
- **Dependencies** (§5.8) — `GET /api/dependencies`; warning banner (worst `sslDaysLeft`); Run check → `POST /:id/check`; "Create reminder recommendation" → `POST /remind` then navigate `/recommendations`
- **History** (§5.10) — Section A (versions ribbon, snapshot table, inspector, **rollback overlay** → `POST /api/history/rollback/:id`) + Section B **Reports**: stat cards, **effectiveness bar chart (intelligent vs static)**, incident history table, range chips → `GET /api/reports`, Export CSV button (client-side from current rows)
- **Settings** (§5.11) — tabs General (profile from `GET /api/auth/me`, "Signed in with Google/GitHub") · LLM & RAG (data from `GET /api/llm/status` — read-only model/endpoint/count + RAG toggle → `PUT /api/settings {ragEnabled}`) · Telemetry Rules (threshold slider, consecutive stepper → PUT) · Safety (maxRecoveryPerHour stepper; requireApproval + dryRun shown ON & locked) · Danger Zone (visual only)

### Definition of done
- [ ] `GET /api/telemetry` returns valid percentiles on seeded probes; chart renders with breaches marked
- [ ] `dependency-checks` hook runs on schedule and via manual `POST /check`; SSL warning incident appears at ≤14 days
- [ ] `GET /api/reports` shows stats + 91/64 effectiveness from seed data; MTTR non-zero
- [ ] `PUT /api/settings` rejects non-whitelisted keys and any attempt to disable `requireApproval`
- [ ] Rollback endpoint flips SchemaVersion statuses + writes audit; History overlay confirms first
- [ ] 4 pages wired per guide §7; no edits outside your file list (`git status`)

---

## Ownership matrix (quick check)

| Path | Part 1 | Part 2 | Part 3 |
|---|---|---|---|
| `server/src/index.js`, `lib/`, `middleware/` | ✅ own | — | — |
| `setup-db.sql`, `server/scripts/seed.js` | ✅ own | read | read |
| `routes/{auth,monitors,probes,health}.js` | ✅ own | — | — |
| `routes/{incidents,recovery,recommendations,llm}.js` | — | ✅ own | — |
| `routes/{telemetry,dependencies,reports,settings,history}.js` | — | — | ✅ own |
| `services/{monitors,probes,probeScheduler,anomaly}` | ✅ own | — | — |
| `services/{llm,rag,diagnosis,recovery,recommendations,schemaDiff}` | — | ✅ own | — |
| `services/{telemetry,reports,settings,checks/*}` | — | — | ✅ own |
| `hooks/afterProbe/*` | loader only | ✅ schemaDiff.js | — |
| `hooks/scheduled/*` | loader only | — | ✅ dependencyChecks.js |
| `client/src/{App,main}.jsx`, `components/*`, `lib/*`, `styles/*` | ✅ own | read | read |
| `pages/{Login,Onboarding,Dashboard,Monitors,UIStates}` | ✅ own | — | — |
| `pages/{Incidents,DiffApproval,Recommendations}` | — | ✅ own | — |
| `pages/{Telemetry,Dependencies,History,Settings}` | — | — | ✅ own |
