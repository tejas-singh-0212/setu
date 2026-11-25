# Setu — Automated Website & API Maintenance Platform

> **SANGAM Hackathon · PS-10 · Team Vanguard (Team 10)**
> Central web platform that monitors websites & REST APIs, diagnoses failures, and recovers safely — with a full incident history. Demo target: **REST Countries API**.

**Setu** continuously monitors registered targets, detects anomalies before they spread, identifies probable root causes (rules + LLM + RAG), executes **approval-gated recovery actions** with post-action health checks, recommends maintenance, and reports on everything — behind Google/GitHub login.

## Objectives covered

Application health monitoring · Runtime anomaly detection · Error & exception analysis · Dependency health monitoring (DNS/SSL) · Intelligent failure diagnosis · Automated recovery (safety-constrained) · Maintenance recommendations · History & reporting (incl. intelligent vs static recovery comparison)

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | **React 18 + Vite + Tailwind** (v1 design tokens kept) |
| Backend | **Node 20 + Express** — JSON API, auto-mounted routes |
| Database | **PostgreSQL + pgvector** (Supabase) — schema & seed in `setup-db.sql`, raw `pg` |
| Auth | **Google + GitHub OAuth** (no passwords, no teams, no paywall) |
| LLM / RAG | **OSS model via free inference API** (OpenRouter/Groq) + **pgvector** retrieval |
| Scheduler | `node-cron` probe scheduler + drop-in hooks |

## Screens (12)

| Screen | Route | v1 reference HTML (`frontend/`) |
|---|---|---|
| Login (Google/GitHub) | `/login` | — |
| Add Monitor | `/onboarding` | `onboarding.html` |
| Dashboard | `/dashboard` | `dashboard.html` |
| Monitors | `/monitors` | — |
| Incidents | `/incidents` | — |
| Diff & Approval (drift detail) | `/diff` | `diff-approval.html` |
| Telemetry | `/telemetry` | `latency.html` |
| Dependencies | `/dependencies` | — |
| Recommendations | `/recommendations` | — |
| History & Reports | `/history` | `history.html` |
| Settings | `/settings` | `settings.html` |
| UI States | `/states` | `ui-states.html` |

## Quick start

```bash
git clone <your-repo-url>
cd setu

# 1. Database (Supabase)
#    - Create a Supabase project
#    - SQL Editor → paste & run setup-db.sql   (schema + demo story seed)
#    - (once) cd server && npm install && npm run seed   (pgvector embeddings)

# 2. Backend
cd server && cp .env.example .env   # fill DATABASE_URL, SESSION_SECRET, OAuth IDs, LLM_API_URL
npm install
npm run dev                          # → http://localhost:4000

# 3. Frontend (second terminal)
cd client && npm install
npm run dev                          # → http://localhost:5173 (proxies /api → :4000)
```

**Single-origin mode:** after `cd client && npm run build`, the Express server
serves `client/dist` itself — verify/demo everything at `http://localhost:4000`.

**OAuth redirect URIs (localhost):**
- Google: `http://localhost:4000/api/auth/google/callback`
- GitHub: `http://localhost:4000/api/auth/github/callback`

## Repository structure

```
setu/
├── README.md            ← you are here
├── context.md           ← full product/design context → paste into AI agents
├── guide.md             ← team instructions (setup, rules, skeletons, nav map)
├── parts.md             ← 3 coding-agent briefs with strict file ownership
├── setup-db.sql         ← SINGLE SOURCE OF TRUTH: schema + canonical seed
├── frontend/            ← v1 HTML screens — REFERENCE ONLY for the React rebuild
├── server/              ← Express (auth, probes, incidents, recovery, LLM…)
│   ├── scripts/seed.js  ← pgvector embeddings (npm run seed)
│   └── src/{routes,services,hooks,middleware,lib}
└── client/              ← React + Vite + Tailwind
    └── src/{pages, components, lib, styles}
```

## How we work

Work is split into **3 parallel parts** (no shared files between agents):

- **Part 1 — Foundation & Monitoring:** schema, seed, OAuth, monitoring pipeline, client foundation, first 5 screens
- **Part 2 — Incidents & Intelligence:** drift detection, diagnosis (LLM + RAG), approval-gated recovery, recommendations
- **Part 3 — Operations & Reporting:** telemetry, dependencies, history/reports, settings

Flow: agent gets `context.md` + `guide.md` + its `parts.md` section → works on a branch → teammate reviews against that part's Definition of Done → PR.

## Docs

- **[context.md](context.md)** — everything an AI agent needs about the product, design system, screens, API contract
- **[guide.md](guide.md)** — setup, golden rules, skeletons, navigation map, DoD, deploy
- **[parts.md](parts.md)** — the three coding briefs + shared contracts + ownership matrix

## Team Vanguard

Tejas Singh (Leader) · Rudra (Co-leader) · Ayush · Ranvijay · Raj

**Milestones:** 25 Nov pre-deployment demo · 4 Dec final evaluation
