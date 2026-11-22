# Setu — Complete Context (for AI agents & teammates)

> Paste this whole file into any AI agent before asking it to build anything.

---

## 1. What is Setu?

Setu is a **central web platform that automates website & API maintenance** not just a schema-drift tool.

**Problem:** Teams run websites and REST APIs. Failures outages, slow responses, error bursts, expiring certificates, broken dependencies, schema drift are discovered late, diagnosed by hand, fixed by hand, and forgotten.

**Solution:** Setu continuously monitors registered websites + REST APIs, detects abnormal behaviour before it spreads, diagnoses probable root causes (rules + LLM + RAG), selects and executes **safe recovery actions**, verifies recovery with post-action health checks, keeps a complete incident history, and recommends maintenance all from one login-protected site.

**Delivery model:** central website · Google/GitHub login · **no teams/invites** · **no paywall (demo)** · live demo target: **REST Countries API** (+ sample websites).

### The 8 objectives → features
| Objective | Feature in Setu |
|---|---|
| Application health monitoring | Composite health score per monitor; probes (uptime, latency, status, schema) |
| Runtime anomaly detection | Rolling-baseline deviation on latency/error rate → anomaly events |
| Error & exception analysis | Error bursts grouped & fingerprinted per monitor (5xx, timeouts, payload errors) |
| Dependency health monitoring | DNS resolution, SSL cert expiry countdown, upstream host status |
| Intelligent failure diagnosis | Correlated root-cause analysis: rules first, LLM adds narrative, RAG pulls similar past incidents |
| Automated recovery | Strategy selection → **config actions only** (timeout/retry/cache/mapping rollback) with safety constraints + approval gate → post-action health check |
| Software maintenance recommendations | Periodic LLM review over telemetry → actionable recommendation cards |
| Maintenance history & reporting | Incident timeline, MTTR, recovery success rate, **intelligent vs static recovery comparison** |

### Product vocabulary (use exactly)
- **Monitor** — a registered target (type `website` or `api`)
- **Probe** — one scheduled check of a monitor (status, latency, schema, ssl/dns fields)
- **Health score** — 0–100 composite per monitor
- **Incident** — a detected problem with lifecycle: open → diagnosing → recovering → resolved/failed
- **Diagnosis** — probable root cause (rules + LLM + RAG context)
- **Recovery action** — a config-level fix Setu itself controls: increase timeout, add retry, enable cache, roll back mapping
- **Safety constraints** — max actions per hour, dry-run default, **human approval gate** (never bypassed)
- **Post-check** — probe run after a recovery action to verify it worked
- **Recommendation** — suggested maintenance with evidence, Apply/Dismiss
- **RAG** — central: embeddings of incidents/fixes/knowledge in **pgvector**, retrieved into LLM prompts
- **LLM** — **central OSS model** (Llama/Qwen) via free inference API — *not* BYOK

---

## 2. Scope boundaries

**In:** monitoring (both types) · anomaly detection · error analysis · dependency checks · diagnosis · config recovery with approval + verification · recommendations · reports · login (Google/GitHub) · audit history.

**Out (never build):** teams/invites/shared projects · billing/paywall/limits · mobile app · restarting third-party servers (recovery is Setu-controlled config only) · dark mode.

---

## 3. Tech stack (locked decisions)

| Layer | Choice |
|---|---|
| Frontend | **React18 + Vite + Tailwind** — design tokens unchanged (same colors/components as v1) |
| Backend | **Node20 + Express** — JSON API for the React app |
| Database | **PostgreSQL + pgvector** (Neon/Supabase free) via **Prisma** ORM |
| Auth | **Google + GitHub OAuth** (Passport.js), sessions stored in Postgres — no passwords |
| LLM | **OSS model (Llama/Qwen) via free inference API** (Groq / Cerebras / HuggingFace) — endpoint configured centrally in server env, not by users |
| RAG | Embeddings (free API or local MiniLM) → **pgvector** in the same Postgres |
| Scheduler | `node-cron` probe scheduler inside the Express server |
| Demo target | **REST Countries API** `https://restcountries.com/v3.1/all?fields=...` + sample websites |

Repo: `server/` (Express + Prisma) · `client/` (Vite React) · `docs/` (DFD/ER/sitemap exports).

---

## 4. Design system (UNCHANGED — v1 stays valid)

### Colors (in `client/src/styles/tailwind.config.js`)
| Token | Value | Use |
|---|---|---|
| `cream` | `#F7F1E8` | page background |
| `surface` | `#FFFFFF` | cards, sidebar, tables |
| `brand` | `#2563EB` | primary buttons, active nav, links |
| `brand-dark` | `#1D4ED8` | button hover |
| `ink` | `#0F172A` | headings, primary text |
| `muted` | `#64748B` | secondary text |
| `ok` | `#16A34A` | healthy, success |
| `warn` | `#D97706` | slow, warning |
| `bad` | `#DC2626` | incident, error, danger |
| `ai` | `#7C3AED` | AI/LLM badges only |

### Typography & shape
- **Inter** (Google Fonts); `font-mono` for schemas, code, URLs, keys
- Cards `rounded-2xl` (16px), buttons/pills `rounded-lg`/`rounded-full`
- Cards: white, `border border-slate-200`, subtle shadow — never content directly on cream

### Shell (React components `<Sidebar/>` + `<Topbar/>` — v1 `shell.js` ported)
**Sidebar (w-64, white):** logo + Setu PROD · workspace selector · WORKSPACE label · nav (active = blue bg/white text):

1. **Dashboard** (`dashboard`)
2. **Monitors** (`monitors`)
3. **Incidents** (`incidents`, red count badge)
4. **Telemetry** (`telemetry`)
5. **Dependencies** (`dependencies`)
6. **Recommendations** (`recommendations`)
7. **History & Reports** (`history`)
8. **Settings** (`settings`)

Bottom: live status · Documentation · user card (logged-in user).
**Topbar:** Setu Studio · search · Healthy pill · production/staging · bell · Feedback *(visual only)*.

`data-page` values: `login` · `onboarding` (both **no shell**) · `dashboard` · `monitors` · `incidents` · `diff` (sidebar active = incidents) · `telemetry` · `dependencies` · `recommendations` · `history` · `settings` · `states` (active = dashboard).

### Component classes (port v1 `components.css` as-is)
`.btn-primary/.btn-secondary/.btn-danger` · `.card` · `.stat-card` · `.pill-ok/warn/bad/ai/neutral` · `.badge-count` · `.table-base` · `.input-base` · `.overlay` system · focus-visible outlines.

### Accessibility
Text ≥14px · status = color **+** text · real `<button>/<a>` · keyboard focusable.

---

## 5. Screen specs (12 screens build all)

Every screen except Login/Add Monitor includes the shell.

### 5.1 Login — `login` (no shell)
- Split: left = logo + **"Reliable systems. Automated maintenance."** + sub; right = card
- H1 **"Welcome to Setu"** · sub "Sign in to your maintenance workspace"
- Buttons: **"Continue with Google"** (white, Google icon) · **"Continue with GitHub"** (dark, GitHub icon)
- Footer: "Free during the demo period — no credit card required." · "By signing in you agree to the terms."

### 5.2 Add Monitor — `onboarding` (no shell)
- Left brand panel (as v1). Right card: chip "STEP 1 OF 1" · H1 **"Add your first monitor"**
- Type chooser: two cards — **🌐 Website** (uptime, SSL, DNS, performance) / **🔌 REST API** (latency, schema, errors); API selected = show method dropdown (GET default)
- Fields: **Name** (e.g. "REST Countries API") · **URL** · **Interval** (30s / 60s / 5min)
- Primary **"Start Monitoring"** → dashboard. Footer "You can add more monitors after setup."

### 5.3 Dashboard — `dashboard`
- Header: **"Application Health"** + green chip "● Live probes active" · sub "Watching **4 monitors** across websites & APIs · last probe 18s ago" · buttons **"+ Add Monitor"** (→ onboarding) · **"Run Probe Now"** (→ states)
- **4 stat cards:** MONITORS `4` (2 APIs · 2 websites) · OPEN INCIDENTS `2` (red, "Action required") · AVG HEALTH SCORE `94%` (green, +2 this week) · AVG RESPONSE TIME `312ms` (p99 1.1s)
- **Monitors table** (filter + type chips ALL/WEBSITE/API): columns MONITOR · TYPE · STATUS · HEALTH · LATENCY (10M) · LAST PROBE · ACTIONS. Canonical rows:

| Monitor | Type | URL | Status | Health | Latency | Last probe | Action |
|---|---|---|---|---|---|---|---|
| REST Countries API | API | restcountries.com/v3.1/all | ● Schema Drift (red) | 71% | 210ms | 18s ago | Review Incident → `diff` |
| JSONPlaceholder | API | jsonplaceholder.typicode.com | ● Slow (amber) | 82% | 1,480ms | 34s ago | Inspect → `telemetry` |
| Open-Meteo Site | Website | open-meteo.com | ● Healthy | 99% | 240ms | 12s ago | View → `dependencies` |
| Wikipedia | Website | www.wikipedia.org | ● Healthy | 98% | 190ms | 9s ago | View → `dependencies` |

- **Right column — Incident feed** (card, "● Live"): 1) **Schema Drift Detected** (red) 2m — REST Countries: removed `flag`, renamed `capital → capital_city` · **Review →** → `diff` 2) **High Latency Alert** (amber) 1h — JSONPlaceholder >1,000ms ×3 consecutive → `telemetry` 3) **SSL Expiry Warning** (amber) 3h — restcountries.com cert expires in 12 days → `dependencies` 4) **Recovery Applied** (green) 5h — retry policy applied & verified on Open-Meteo → `history`. Footer **"View all incidents (28)"** → `incidents`
- **Right column — Dependency warnings card:** 2 warnings (SSL expiry ×1, rate-limit ×1) → `dependencies`

### 5.4 Monitors — `monitors`
- H1 **"Monitors"** · sub "Registered websites & REST APIs" · primary **"+ Add Monitor"** → `onboarding`
- Table: NAME · TYPE · URL (mono) · INTERVAL · STATUS · HEALTH · last edited · actions (pause/edit/delete — visual)
- Rows = same 4 canonical monitors; footer "4 of 4 monitors · all probing active"

### 5.5 Incidents — `incidents`
- H1 **"Incidents"** · filters: Last 7 days · Type: All · Status: All · search
- Table: TIME · MONITOR · TYPE chip (drift/latency/error/dependency) · SEVERITY · PROBABLE CAUSE · STATUS (open/diagnosing/recovering/resolved) · ACTION
- Canonical rows:
  1. Today 14:22 · REST Countries API · **Drift** (red) · High · "Upstream renamed `capital` field" · Open · **Review →** → `diff`
  2. Today 11:18 · JSONPlaceholder · **Latency** (amber) · Med · "3 consecutive calls >1,000ms" · Recovering · **Open →** → `telemetry`
  3. Yesterday · Wikipedia · **Dependency** (amber) · Low · "SSL cert expires in 12 days" · Open · **Open →** → `dependencies`
  4. Yesterday · Open-Meteo Site · **Error** (red) · Med · "5xx burst (7 requests/5min)" · Resolved · **View →** → `history`
- Non-drift rows expand inline (no navigation): timeline (detected → diagnosis → action → post-check) + **Diagnosis** panel + recovery buttons (Apply via approval)

### 5.6 Diff & Approval (drift incident detail) — `diff`
- Everything from v1 diff screen (guardrail banner, badges, AST side-by-side diff, AI proposal card with RAG badge, confirm overlay, bottom bar) — **plus two new panels:**
- **Probable Root Cause** card (violet AI badge): "Upstream renamed `capital` → `capital_city` and removed `flag`; `population` type changed number→string. Correlated with: provider changelog not published; 420 req/min affected. Confidence 94% (RAG: 8 similar past incidents)."
- **Suggested recovery actions** (choose, then approval gate): ① Apply transform (remap + type coercion) ② Rollback to schema v1.1 ③ Set fallback timeout 5s — each with safety chip "Dry-run first · post-check enabled"
- Canonical diff data = v1 spec (expected v3.2-style contract vs detected v4.0-style) with `capital/capital_city` naming now (rename the fields from v1 Stripe story to REST Countries: `capital → capital_city`, removed `flag`, type-changed `population`)

### 5.7 Telemetry — `telemetry`
- v1 Latency screen, retitled **"Telemetry & Performance"**; keeps: P50/P99/SLA/error cards, 24h curve with threshold, Active Alert + 3 remedy cards (Configure Timeout/Retry → `settings`, Apply Remedy → approval in `diff`), slow-call log
- Data: JSONPlaceholder incident (1,480ms, threshold 1,000ms) as in v1

### 5.8 Dependencies — `dependencies`
- H1 **"Dependency Health"** · sub "DNS, certificates and upstreams for every monitor"
- Table per monitor: MONITOR · DNS (green ✓ resolved) · SSL ISSUER · EXPIRES (chip: **"12 days"** amber for restcountries.com; "84 days" green others) · UPSTREAM HOSTS · RATE LIMIT (OK / throttled chip) · ACTION (Run check)
- Warning banner: "⚠ restcountries.com certificate expires in 12 days — renew to avoid outage." + button **"Create reminder recommendation"** → adds to `recommendations`
- Small stat cards: CHECKS TODAY `48` · FAILURES `1` · NEXT EXPIRY `12d`

### 5.9 Recommendations — `recommendations`
- H1 **"Maintenance Recommendations"** · sub "Generated from telemetry, incidents and RAG knowledge base"
- Cards (each: violet "LLM + RAG" badge, title, **Why** (evidence), suggested action, buttons **Apply** (→ approval gate `diff`/inline) · **Dismiss**):
  1. **"Add retry with exponential backoff to JSONPlaceholder monitor"** — Why: 12 slow calls this week; 3 recovered by retry in similar past incidents (RAG ×5) · Apply
  2. **"Bake `capital_city` remap into the transform permanently"** — Why: 2nd drift this month on the same field · Apply
  3. **"Extend website probe interval to 2 minutes"** — Why: 0 anomalies on website monitors in 7 days; cuts noise · Apply
  4. **"Renew SSL certificate for restcountries.com"** — Why: expires in 12 days (from `dependencies`) · Dismiss/Apply
- Footer: "Next recommendation run in 6h · last run produced 4 items"

### 5.10 History & Reports — `history`
- **Section A — keep v1:** Contract Evolution Ribbon (version cards), snapshot table, Snapshot Inspector, rollback confirm overlay, bottom bar
- **Section B — new Reports panel** (top or tab):
  - Stat cards: INCIDENTS (7d) `14` · AUTO-RECOVERED `11` · MANUAL APPROVALS `3` · MTTR `4.2m`
  - **Recovery effectiveness chart** (bar/compare): *Intelligent recovery* **91% success** vs *Static rules* **64% success** (last 30 days) — the rubric-required comparison
  - Incident history table: date · monitor · type · diagnosis · action taken · post-check result (pass/fail) · duration
  - Buttons: **Export report (CSV)** (visual) · range chips 7d/30d/90d

### 5.11 Settings — `settings`
- Tabs: **General** (profile: name, email, avatar from OAuth · session "Signed in with Google") · **LLM & RAG** · **Telemetry Rules** · **Safety** · **Danger Zone**
- **LLM & RAG card** (no user API key!): status card — Model `Llama 3.370B (Groq free tier)` ● healthy · Endpoint (read-only, set by server env) · RAG context toggle ON · "RAG index: 1,420 embeddings (pgvector)" · admin note "Endpoint configured by administrator"
- **Safety card:** require-approval toggle (ON, locked for demo) · max recovery actions/hour stepper `3` · dry-run default toggle ON · post-check mandatory toggle ON
- **Telemetry Rules:** latency threshold slider 1,000ms · consecutive slow calls `3` · probe interval default · schema inspection inline
- **Danger Zone:** Clear incident history & RAG index (red outline) — no link needed
- Remove: v1 BYOK API-key field entirely (replaced by central config)

### 5.12 UI States — `states`
- v1 three states, updated copy: Empty **"No monitors yet"** + Add Monitor → `onboarding` · Loading **"Running probes…"** (probe table Comparing/Queued) · Error **"Lost connection to API — Retry"** → dashboard

---

## 6. API surface (backend contract)

| Method & path | Purpose |
|---|---|
| `GET /api/auth/google`, `/api/auth/github`, `GET /api/auth/me`, `POST /api/auth/logout` | OAuth login/session |
| `GET/POST /api/monitors`, `PATCH/DELETE /api/monitors/:id` | monitor CRUD |
| `POST /api/monitors/:id/probe` | run probe now |
| `GET /api/probes?monitor=` | probe history |
| `GET /api/health` | dashboard aggregates |
| `GET /api/incidents`, `GET /api/incidents/:id` | incident list/detail (includes diagnosis) |
| `POST /api/incidents/:id/recovery` | propose recovery (goes to approval) |
| `POST /api/recovery/:id/approve` · `/reject` · `/verify` | approval gate → execute → post-check |
| `GET /api/dependencies` | dependency checks |
| `GET/POST /api/recommendations`, `POST /api/recommendations/:id/apply|dismiss` | recommendations |
| `GET /api/reports?range=` | history + effectiveness metrics |
| `GET/PUT /api/settings` | thresholds, safety, LLM status |

Auth: session cookie on **every** route except `/api/auth/google|github`.

---

## 7. Canonical demo rules (REST Countries story)

- Demo user: **Sarah Chen** (Google login)
- Monitors: **REST Countries API** (`https://restcountries.com/v3.1/all?fields=name,capital,currencies,region,population,area,flag`), **JSONPlaceholder**, **open-meteo.com**, **www.wikipedia.org**
- Open story: drift on REST Countries (`capital → capital_city`, removed `flag`, `population` number→string) + latency on JSONPlaceholder + SSL warning on restcountries.com
- Recovery examples: retry policy (JSONPlaceholder) · transform apply / rollback (REST Countries)
- Never invent monitors, numbers, or incidents outside this file — all screens tell one story
- LLM always labelled "Llama via free inference API" — never "BYOK", never "self-hosted"

---

## 8. Out of scope (do NOT build)

No backend-free mock-only app (backend is real) · no paywall/billing code · no team/invite/multi-tenant · no password login · no dark mode · no new sidebar items beyond the 8 listed · no real third-party restarts · charts = inline SVG or lightweight lib already chosen — no dashboard frameworks.
