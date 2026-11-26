# Setu — Automated Website & API Maintenance Platform

> **SANGAM Hackathon · PS-10 · Team Vanguard (Team 10)**
> A central web platform that monitors websites and REST APIs, detects anomalies and schema drift, diagnoses probable root causes (rules + LLM + RAG), and recovers safely through a human approval gate — with a full audit history. Demo target: **REST Countries API**.

---

## Contents

- [What Setu does](#what-setu-does)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [How it works](#how-it-works)
- [Screens](#screens)
- [API reference](#api-reference)
- [Security model](#security-model)
- [Extending Setu (hooks)](#extending-setu-hooks)
- [Testing](#testing)
- [Repository structure](#repository-structure)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Team](#team)

---

## What Setu does

| Objective | How Setu covers it |
|---|---|
| Application health monitoring | Scheduled HTTP probes per monitor (latency, status, health score) |
| Runtime anomaly detection | N consecutive slow probes → latency incident; ≥3 5xx in 5 min → error incident |
| Error & exception analysis | Probe errors, status codes and slow calls surfaced in Telemetry |
| Dependency health | Hourly DNS + SSL-expiry checks, rate-limit (HTTP 429) detection |
| API contract / schema drift | Every API response is diffed against the expected schema (rename / remove / type change) |
| Intelligent diagnosis | Rules first, pgvector RAG over past fixes, then an LLM narrative with confidence |
| Safe automated recovery | Config-only actions (timeout, retry, cache, schema rollback) → **human approval** → execute → post-check probe |
| Maintenance recommendations | Cards derived from each user's own incidents and dependency checks |
| History & reporting | Schema versions, audit trail, MTTR, recovery effectiveness |

---

## Architecture

```
                 ┌──────────────────────────────┐
 Browser ───────▶│ client/  React + Vite (5173) │
                 └──────────────┬───────────────┘
                                │ /api (Vite proxy, or same origin on :4000)
                 ┌──────────────▼───────────────┐      ┌──────────────────────────┐
                 │ server/  Express (4000)      │─────▶│ PostgreSQL + pgvector    │
                 │  • OAuth sessions            │      │ (Supabase)               │
                 │  • probe scheduler + hooks   │      └──────────────────────────┘
                 │  • diagnosis / recovery      │
                 │  • SSRF-guarded probe client │─────▶ monitored websites & APIs
                 │                              │─────▶ LLM API (OpenRouter-compatible)
                 └──────────────┬───────────────┘
                                │ X-User-Id + X-Internal-Token (127.0.0.1 only)
                 ┌──────────────▼───────────────┐
                 │ rag_pipeline/  FastAPI (8000)│─────▶ Groq (schema-fix suggestions)
                 │  Chroma + MiniLM embeddings  │
                 └──────────────────────────────┘
```

There are **three local services** for the demo: the frontend (`:5173`), the backend (`:4000`) and the RAG pipeline (`:8000`). The RAG pipeline is optional — if it is down, the app keeps working and falls back to built-in suggestions.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18, React Router 6, Vite 5, Tailwind 3, lucide-react |
| Backend | Node 20+, Express 4, raw `pg`, `node-cron`, Passport (Google + GitHub OAuth) |
| Sessions | `express-session` stored in Postgres (`connect-pg-simple`) |
| Database | PostgreSQL + pgvector (Supabase). Schema + demo seed in `setup-db.sql` |
| Diagnosis LLM | Any OpenAI-compatible `/chat/completions` endpoint (default: OpenRouter, Llama 3.3 70B) |
| In-app RAG | pgvector (384-dim); provider embeddings when available, deterministic local hash embeddings otherwise |
| Schema-fix RAG service | Python FastAPI + ChromaDB + `sentence-transformers/all-MiniLM-L6-v2` + Groq |

---

## Quick start

### Prerequisites

- **Node.js 20+** and npm
- **Python 3.10+** (only for the RAG pipeline)
- A **Supabase** project (or any PostgreSQL with the `vector` extension)
- Optional: Google / GitHub OAuth apps, an LLM API key, a Groq API key

### 1. Database

1. Create a Supabase project.
2. Open **SQL Editor**, paste the whole of [`setup-db.sql`](setup-db.sql) and run it. It creates the schema and the demo story (user *Sarah Chen*, 4 monitors, incidents, schema versions). The script is idempotent — **re-run it after pulling schema changes** (e.g. the `embedding.user_id` column).

### 2. Backend (`server/`)

```powershell
cd server
copy .env.example .env      # then fill in the values — see "Environment variables"
npm install
npm run seed                # once: loads the pgvector knowledge embeddings
npm run dev                 # http://localhost:4000  (health: /api/ping)
```

### 3. RAG pipeline (`rag_pipeline/`) — optional

```powershell
cd rag_pipeline
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python index_fixes.py       # once: builds rag_pipeline/chroma_db (required before starting)
uvicorn api:app --host 127.0.0.1 --port 8000
```

On macOS/Linux you can use `./start-rag.sh` from the repo root instead of the last line. The service reads `server/.env` for `GROQ_API_KEY`, `GROQ_MODEL` and `RAG_SERVICE_TOKEN`. Health check: `http://127.0.0.1:8000/health`.

### 4. Frontend (`client/`)

```powershell
cd client
npm install
npm run dev                 # http://localhost:5173  (proxies /api → :4000)
```

Open `http://localhost:5173`. Without OAuth credentials, **Login with Google/GitHub signs you in as the seeded demo user** (development only).

**Single-origin mode:** run `npm run build` in `client/`; the Express server then serves `client/dist` itself and the whole app is available at `http://localhost:4000`.

**OAuth redirect URIs** (register these in the provider consoles):

- Google: `http://localhost:4000/api/auth/google/callback`
- GitHub: `http://localhost:4000/api/auth/github/callback`

---

## Environment variables

All variables live in **`server/.env`** (template: [`server/.env.example`](server/.env.example)). The RAG pipeline reads the same file; `rag_pipeline/.env` is only a fallback for running it standalone.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **yes** | Postgres connection string (keep `?sslmode=require` for Supabase) |
| `SESSION_SECRET` | yes in prod | Cookie signing secret. Production refuses to boot with the default or anything shorter than 32 chars |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Google OAuth. Empty → demo-user login (dev only) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | no | GitHub OAuth. Empty → demo-user login (dev only) |
| `CLIENT_URL` | no | Where users land after login (`http://localhost:5173` in dev) |
| `PORT` | no | Backend port, default `4000` |
| `PUBLIC_BASE_URL` | no | Base for OAuth callback URLs, default `http://localhost:4000` |
| `LLM_API_URL` | no | OpenAI-compatible base URL for diagnosis narratives |
| `LLM_API_KEY` | no | Key for the LLM endpoint. Empty → diagnosis degrades to rules only |
| `LLM_MODEL` | no | Model id, default `meta-llama/llama-3.3-70b-instruct:free` |
| `RAG_SERVICE_URL` | no | RAG pipeline base URL, default `http://127.0.0.1:8000` |
| `RAG_SERVICE_TOKEN` | recommended | Shared secret between backend and RAG service (sent as `X-Internal-Token`) |
| `GROQ_API_KEY` / `GROQ_MODEL` | for RAG suggestions | Used by the RAG pipeline to generate schema-fix proposals |
| `RAG_HOST` / `RAG_PORT` | no | Bind address/port for `start-rag.sh` (default `127.0.0.1:8000`) |

**Generating `RAG_SERVICE_TOKEN`** — any long random string; set it once in `server/.env` and restart both services:

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

If it is left empty the RAG service still works but logs a warning and accepts unauthenticated requests — acceptable only because it binds to `127.0.0.1`.

Never commit `.env` files — `.gitignore` excludes them.

---

## How it works

### Monitoring pipeline

1. **Add a monitor** (`/onboarding`) — website or API, `GET`/`POST`, interval. The URL must be a public `http(s)` target (private, loopback and metadata addresses are rejected).
2. **Probe scheduler** (`services/probeScheduler.js`) creates a cron job per active monitor and re-scans for new/paused monitors every 60 s.
3. **Each probe** (`services/probes.js`) checks DNS, makes the HTTP request through the SSRF-guarded client, records latency/status, reads the certificate expiry for HTTPS, and adjusts the monitor's health score.
4. **afterProbe hooks** run next — `schemaDiff` infers the JSON schema of API responses and compares it to the *expected* schema version.
5. **Anomaly detection** (`services/anomaly.js`) opens latency or error-burst incidents using per-user thresholds from Settings.
6. **Dependency checks** run hourly (DNS, SSL expiry, rate limiting) and open a dependency incident when a certificate expires within 14 days.

### Schema drift

- The first JSON response for an API becomes the baseline (`v1.0`, status `expected`).
- Later responses are diffed: a removed field paired with a similar new field is a **rename** (`capital → capital_city`); others are **removed** or **type_changed**.
- **Additive changes (new fields only) are not drift** — they are backward-compatible and ignored.
- A breaking change records a schema version, a change event and one open drift incident per monitor.

### Diagnosis

Opening an incident triggers `services/diagnosis.js`:

1. **Rules** give a type-based root cause and confidence.
2. **RAG** retrieves similar past fixes from pgvector — shared knowledge rows plus *the owner's own* verified fixes only.
3. **LLM** (if configured) writes a two-sentence root cause + next action. Any LLM failure falls back to rules — never a 5xx.

For drift incidents the backend also asks the **RAG pipeline** for a schema-fix suggestion (field mappings citing retrieved historical fixes). Suggestions always require human approval.

### Recovery (approval-gated)

```
propose ──▶ approve (human gate) ──▶ execute config action ──▶ verify (post-check probe)
                                                                  ├─ pass → action verified, incident resolved, fix indexed into RAG
                                                                  └─ fail → action failed, incident failed
```

- Allowed actions: `timeout`, `retry`, `cache`, `transform`, `mapping_rollback` — Setu-controlled configuration only, never code or the upstream service.
- Actions always target the incident's own monitor; `timeoutMs` is bounded to 1000–30000 and `retries` to 0–5.
- **Max recovery actions per hour** (Settings, default 3) is enforced at approval time.
- `requireApproval` and `dryRunDefault` are locked ON.
- Every step writes an incident event and an audit-log row.

---

## Screens

| Screen | Route | Notes |
|---|---|---|
| Login | `/login` | Google / GitHub |
| Add Monitor | `/onboarding` | Create website or API monitor |
| Dashboard | `/`, `/dashboard` | Health, open incidents, latency, dependency warnings |
| Monitors | `/monitors` | Pause/resume, probe now, delete |
| Incidents | `/incidents` | Filters, diagnosis, recovery panel |
| Diff & Approval | `/diff`, `/diff/:id` | Expected vs detected schema, RAG suggestion, approve/reject |
| Recommendations | `/recommendations` | Apply (through the approval gate) or dismiss |
| Telemetry | `/telemetry` | p50/p99, SLA breaches, slow calls, consecutive-slow alert |
| Dependencies | `/dependencies` | DNS/SSL status, check now, renewal reminders |
| History & Reports | `/history` | Schema versions, rollback, audit trail, MTTR, effectiveness |
| Settings | `/settings` | Thresholds, probe interval, RAG toggle, LLM status |
| UI States | `/states` | Loading / empty / error state gallery (no auth) |

All routes except `/login`, `/onboarding` and `/states` require a session.

---

## API reference

All endpoints are under `/api`, return JSON, and (except auth entry points and `/ping`) require a session cookie. Every query is scoped to the logged-in user.

| Method | Path | Description |
|---|---|---|
| GET | `/ping` | Liveness check |
| GET | `/auth/google`, `/auth/github` | Start OAuth login |
| GET | `/auth/me` | Current user |
| POST | `/auth/logout` | End session |
| GET | `/health` | Dashboard aggregates |
| GET / POST | `/monitors` | List / create monitors |
| PATCH / DELETE | `/monitors/:id` | Update (name, interval, timeout, retries, cache, status) / delete |
| POST | `/monitors/:id/probe` | Run one probe now |
| GET | `/probes?monitor=&range=` | Probe history (`1h`, `6h`, `24h`, `7d`) |
| GET | `/incidents?type=&status=&range=&q=` | Incident list |
| GET | `/incidents/:id` | Detail + diagnosis + events + actions + drift context |
| POST | `/recovery` | Propose an action `{incidentId, kind, payload}` (never executes) |
| POST | `/recovery/:id/approve` | Human gate: approve and execute |
| POST | `/recovery/:id/reject` | Reject a pending action |
| POST | `/recovery/:id/verify` | Post-check probe → verified / failed |
| GET / POST | `/recommendations` | List / create |
| POST | `/recommendations/:id/apply`, `/:id/dismiss` | Apply (returns pending action) / dismiss |
| GET | `/telemetry?range=&monitor=` | Latency stats, curve, slow calls, alert |
| GET | `/dependencies` | Latest DNS/SSL check per monitor |
| POST | `/dependencies/:monitorId/check` | Run DNS + SSL check now |
| POST | `/dependencies/remind` | Create a renewal recommendation |
| GET | `/history` | Schema versions + audit trail |
| POST | `/history/rollback/:versionId` | Make a schema version the expected one |
| GET | `/reports?range=7d\|30d\|90d` | Stats, recovery effectiveness, incident history |
| GET / PUT | `/settings` | Read / update whitelisted settings |
| GET | `/llm/status` | LLM + RAG status (no secrets) |

**RAG pipeline (internal, `127.0.0.1:8000`):** `GET /health` and `POST /internal/v1/schema-fix-suggestions` (headers `X-User-Id`, `X-Internal-Token`).

---

## Security model

- **Authentication:** Google/GitHub OAuth; sessions stored server-side in Postgres, `SameSite=Lax` cookies. The demo-user fallback is disabled when `NODE_ENV=production`.
- **Tenant isolation:** every route filters by the session user; recovery actions are pinned to the incident's own monitor and re-check ownership at approve and verify; RAG retrieval only returns shared knowledge plus the caller's own fixes.
- **SSRF protection** (`server/src/lib/netGuard.js`): monitor URLs are validated at creation, and every outbound probe re-validates **each redirect hop** and checks the **resolved IP at connect time**, which blocks DNS-rebinding tricks. Private, loopback, link-local/metadata (`169.254.169.254`), CGNAT and multicast ranges are refused.
- **Recovery safety:** config-only actions, bounded values, an hourly limit enforced at execution under a per-user lock, mandatory approval, post-check verification, full audit log.
- **RAG service:** bound to `127.0.0.1`, authenticated with `RAG_SERVICE_TOKEN`, request fields length-limited, model output validated (only cited evidence IDs are accepted).
- **Errors:** in production, 5xx responses return a generic message; details are logged server-side.
- **Secrets:** only in `.env` (git-ignored); `/api/llm/status` never returns keys.

---

## Extending Setu (hooks)

Drop a file into a hooks folder and it is loaded at startup — no other wiring needed.

```js
// server/src/hooks/afterProbe/myHook.js — runs after every probe
module.exports = {
  name: 'my-hook',
  run: async ({ monitor, probe, payload, pool }) => {
    // payload = parsed JSON body for successful API probes, otherwise null
  },
}

// server/src/hooks/scheduled/myJob.js — runs every intervalMs (and once at boot)
module.exports = {
  name: 'my-job',
  intervalMs: 3600000,
  run: async () => {},
}
```

Hook errors are logged and never crash the server. Similarly, any `server/src/routes/<name>.js` exporting an Express router is auto-mounted at `/api/<name>`.

---

## Testing

```powershell
# RAG pipeline unit tests (Groq and Chroma are mocked)
cd rag_pipeline
.venv\Scripts\Activate.ps1
pytest

# Frontend production build check
cd client
npm run build
```

The backend has no automated test suite yet; verify it end-to-end by running the demo flow below.

**Demo flow (REST Countries story):** Dashboard → open the *Schema drift detected on REST Countries API* incident → review the diff and RAG suggestion on Diff & Approval → approve the mapping → post-check passes → see the resolution in History & Reports.

---

## Repository structure

```
setu/
├── README.md               ← you are here
├── context.md              ← product, design system, screen specs, API contract
├── guide.md                ← team setup, golden rules, skeletons, navigation map
├── parts.md                ← the 3 coding briefs + ownership matrix
├── setup-db.sql            ← schema + demo seed (single source of truth, idempotent)
├── start-rag.sh            ← starts the RAG pipeline on 127.0.0.1:8000
├── server/                 ← Express backend
│   ├── scripts/seed.js     ← pgvector knowledge embeddings (npm run seed)
│   └── src/
│       ├── index.js        ← bootstrap, sessions, route auto-mount, SPA serving
│       ├── lib/            ← db.js (pg pool), netGuard.js (SSRF-safe HTTP)
│       ├── middleware/     ← auth (OAuth + requireAuth), error handler
│       ├── routes/         ← one file per /api/<name>
│       ├── services/       ← probes, anomaly, diagnosis, recovery, rag, telemetry…
│       └── hooks/          ← afterProbe/ and scheduled/ drop-in hooks
├── rag_pipeline/           ← FastAPI + Chroma schema-fix suggestion service
│   ├── api.py              ← HTTP API
│   ├── retrieve_fixes.py   ← per-user filtered vector search
│   ├── llm_client.py       ← Groq call + strict output validation
│   ├── index_fixes.py      ← builds chroma_db from data/
│   ├── data/               ← approved synthetic fixes (demo dataset)
│   └── tests/
└── client/                 ← React + Vite + Tailwind
    └── src/{pages, components, lib, styles}
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Backend exits with `DATABASE_URL environment variable is not defined` | Create `server/.env` from `.env.example` |
| Login lands on `{"error":"Not found"}` or loops back to `/login` | Check `CLIENT_URL` and the OAuth callback URIs; make sure `setup-db.sql` created the `session` table |
| RAG service crashes on start (`Collection ... does not exist`) | Run `python index_fixes.py` first |
| Diff & Approval shows built-in suggestions only | RAG service is down, `GROQ_API_KEY`/`GROQ_MODEL` missing, or `RAG_SERVICE_TOKEN` differs between the two services |
| RAG suggestions return `401` | `RAG_SERVICE_TOKEN` mismatch — set it once in `server/.env` and restart both services |
| Diagnosis is always rules-only | `LLM_API_KEY` empty or the endpoint is unreachable (expected in keyless mode) |
| `column "user_id" does not exist` in logs | Re-run `setup-db.sql` to apply the latest migration |
| Probe error `Blocked request to private or metadata address` | The target (or a redirect) points to a private IP — by design |

---

## Known limitations

Open items from the latest audit, not yet addressed:

- Editing a monitor's interval/timeout takes effect only after a server restart; intervals ≥ 60 min and < 60 s are scheduled incorrectly.
- `PATCH /monitors/:id` does not validate values; non-UUID ids return 500.
- Health score only decreases; `retries` / `cache_enabled` are stored but not yet used by the prober.
- Session id is not regenerated at login; no rate limiting or security headers (helmet).
- Every drift-incident view calls the RAG service (no caching).
- Frontend dev dependencies (`vite`, `react-router-dom`) have published advisories — upgrade before deploying.
- Recovery "verified" means the post-check probe returned HTTP OK; it does not re-check the schema.

---

## Team

**Team Vanguard** — Tejas Singh (Leader) · Rudra (Co-leader) · Raj · Ranvijay · Ayush

**Milestones:** 25 Nov pre-deployment demo · 4 Dec final evaluation

