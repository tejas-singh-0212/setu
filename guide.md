# Setu — Team Guide (Frontend + Backend)

How to build and ship your part. Read once, keep it open while you work.

---

## 1. Setup (once)

**Prereqs:** Node 20+ · a Postgres database with **pgvector** (Neon free — enable the extension) · git

```bash
git clone <repo-url>
cd setu

# Backend
cd server
cp .env.example .env        # fill DATABASE_URL, OAuth IDs, SESSION_SECRET, LLM_API_URL
npm install
npx prisma migrate dev      # creates tables
npx prisma db seed          # demo data (REST Countries story)
npm run dev                 # → http://localhost:4000

# Frontend (second terminal)
cd client
npm install
npm run dev                 # → http://localhost:5173 (proxies /api to :4000)
```

**OAuth (do this on day 1 — it blocks login):**
- Google Cloud Console → Credentials → OAuth client (Web) → redirect URI `http://localhost:5173/api/auth/google/callback` + prod URI later
- GitHub → Settings → Developer settings → OAuth App → callback `.../api/auth/github/callback`
- Put client IDs/secrets in `server/.env` only — **never commit**

---

## 2. Folder structure

```
setu/
├── README.md
├── guide.md                  ← this file
├── context.md                ← full product/design context → paste into AI agents
├── docs/                     ← DFD, ER, sitemap exports
│
├── server/                   ← Express + Prisma (Backend)
│   ├── src/
│   │   ├── index.js          # app bootstrap (port 4000)
│   │   ├── routes/           # auth, monitors, probes, incidents, recovery, dependencies, recommendations, reports, settings
│   │   ├── services/         # probeScheduler, anomaly, diagnosis, recovery, rag, llm, reports
│   │   ├── middleware/       # auth.js (requireAuth), errorHandler.js
│   │   └── lib/              # prisma.js client
│   ├── prisma/
│   │   ├── schema.prisma     # all tables (users, monitors, probes, incidents, recovery_actions, …)
│   │   └── seed.js           # canonical demo data from context.md §7
│   ├── .env.example
│   └── package.json
│
├── client/                   ← React + Vite + Tailwind (Frontend)
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx           # router: all routes below
│   │   ├── pages/            # Login, Onboarding, Dashboard, Monitors, Incidents, DiffApproval, Telemetry, Dependencies, Recommendations, History, Settings, UIStates
│   │   ├── components/       # Sidebar, Topbar, AppLayout, StatCard, Pill, DataTable, Modal, Overlay…
│   │   ├── lib/api.js        # fetch wrapper (credentials: 'include')
│   │   ├── lib/mock.js       # temporary data until API is ready — DELETE at parity
│   │   └── styles/
│   │       ├── components.css        # ported from v1 (.btn, .card, .pill, .overlay)
│   │       └── tailwind.config.js    # same tokens as v1 (cream, brand, ink, ok…)
│   ├── index.html
│   └── package.json
│
└── root *.html, assets/js/shell.js    # v1 screens — REFERENCE ONLY for the React rebuild
```

---

## 3. Golden rules (PR rejected if broken)

**Frontend**
1. **Tokens only** — colors/type via Tailwind config; no hardcoded hex/fonts, no dark mode
2. **Reuse components** — `StatCard`, `Pill`, `DataTable`, `Modal`… don't restyle buttons/cards per page
3. **One page = one file** in `pages/`; shared shell lives in `components/` — don't edit `Sidebar`/`Topbar` without owner
4. **No invented data** — fetch from `/api`; until your endpoint exists use `lib/mock.js` (same canonical numbers as context.md §7) and flag it in your PR
5. **Every screen has loading + error + empty states** (context.md §5.12 patterns)

**Backend**
6. **All DB access via Prisma** — no raw SQL outside `schema.prisma`/migrations
7. **Routes thin, services fat** — route parses/validates → service does the work
8. **Auth on everything** — `requireAuth` on all `/api/*` except `/api/auth/google|github`
9. **Secrets only in `.env`** — never in code, never committed; `.env.example` lists keys only
10. **Recovery must never bypass safety** — approval gate + max-actions/hour + dry-run checks live in the recovery service, called before any execute; no exceptions
11. **Audit everything** — every recovery/rollback writes an audit entry (actor = session user or `system`)

**Both**
12. No paywall/billing/teams/invites code — ever
13. English only · PR per feature · AI agents get `context.md` + your screenshot as context

---

## 4. Page skeleton (React)

```jsx
// client/src/pages/YourScreen.jsx
import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import StatCard from '../components/StatCard';
import { get } from '../lib/api';

export default function YourScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    get('/health')                 // → /api/health
      .then(setData)
      .catch(setError);
  }, []);

  if (error) return <AppLayout dataPage="dashboard"><ErrorState onRetry={() => location.reload()} /></AppLayout>;
  if (!data) return <AppLayout dataPage="dashboard"><SkeletonRows /></AppLayout>;

  return (
    <AppLayout dataPage="dashboard">
      <h1 className="text-2xl font-bold">…</h1>
      <StatCard label="MONITORS" value={data.monitorCount} />
      {/* … */}
    </AppLayout>
  );
}
```

`lib/api.js`:
```js
export const get = (p) => fetch(`/api${p}`, { credentials: 'include' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
export const post = (p, body) => fetch(`/api${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) }).then(r => r.json());
```

Protected routes: wrap in `<RequireAuth>` → redirect to `/login` when `GET /api/auth/me` returns 401.

---

## 5. Backend service skeleton

```js
// server/src/routes/monitors.js
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const monitorSvc = require('../services/monitors');

router.get('/', requireAuth, async (req, res, next) => {
  try { res.json(await monitorSvc.listFor(req.user.id)); }
  catch (e) { next(e); }
});
module.exports = router;
```

- `services/probeScheduler.js` — `node-cron` per monitor interval → writes `probes`, updates health score
- `services/recovery.js` — **order matters:** validate safety limits → (approval if required) → execute config action → run post-check → write audit/incident event
- `services/llm.js` — single client for the OSS endpoint (`LLM_API_URL` + optional `LLM_API_KEY` from env)
- `services/rag.js` — embed → pgvector upsert; `retrieve(query, k)` for diagnosis/recommendations

---

## 6. How to build your screen with an AI agent

Give the agent **all four in one message:**
1. `context.md` — whole file (your screen's spec is in §5)
2. **The existing v1 HTML file at repo root** (`dashboard.html`, `diff-approval.html`, `history.html`, `latency.html`, `settings.html`, `ui-states.html`, `onboarding.html`) — the markup is your reference: port its structure, class names (`.card`, `.pill-*`, `.btn-*`, `.table-base`) and exact text into JSX. *(New screens — Login, Monitors, Incidents, Dependencies, Recommendations — have no v1 file; context.md §5 is their sole spec.)*
3. The reference screenshot (Figma export / `docs/screenshots/`)
4. This line:

> "Build `<Page>.jsx` for the Setu React client. Follow context.md §5.X exactly — layout, sections, text, canonical data. **Port the structure, class names, and copy from the provided v1 HTML file**, replacing static markup with live data via the api helper. Use existing components from `../components` and Tailwind tokens only; fall back to `lib/mock.js` until the endpoint exists. Do not add routes, colors, or screens beyond the spec."

**Rules for the v1 HTML files:** treat them as **read-only reference** — never edit or delete one until its React page passes the checklist below; then delete it in the same PR.

**Self-review before PR:** exact text/numbers vs context.md · no hardcoded hex · loading/error states present · nav targets correct (§7) · no invented data · structure matches its v1 HTML (if one exists).

---

## 7. Navigation map (wire these)

| From | Element | Goes to |
|---|---|---|
| any | sidebar item | its route (`/monitors`, `/incidents`, …) |
| Login | Continue with Google / GitHub | OAuth flow → `/dashboard` |
| Onboarding | Start Monitoring | `/dashboard` |
| Dashboard | Review Incident / feed "Review →" | `/incidents/:id` (drift → `/diff`) |
| Dashboard | Add Monitor | `/onboarding` |
| Dashboard | Run Probe Now | `/states` |
| Dashboard | Inspect (slow row) | `/telemetry` |
| Dashboard | SSL warning / View | `/dependencies` |
| Dashboard | Recovery Applied / View all incidents | `/history` · `/incidents` |
| Incidents | drift row Review | `/diff` |
| Incidents | latency/dependency row Open | `/telemetry` · `/dependencies` |
| Diff | Approve → Confirm overlay → Confirm | `/history` |
| Diff | Reject / Cancel | `/incidents` |
| Diff | View rollback point | `/history` |
| Telemetry | Apply Remedy / Suggest Fix | approval gate (`/diff` or inline) |
| Telemetry | Configure Timeout/Retry | `/settings` |
| Dependencies | Create reminder recommendation | `/recommendations` |
| Recommendations | Apply | approval gate → `/history` after confirm |
| History | Prepare Rollback / Quick Revert → Confirm | `/dashboard` |
| Settings | Save / Discard | `/dashboard` |
| States | Add Endpoint · Retry | `/onboarding` · `/dashboard` |

Overlays: `.overlay` + `openOverlay/closeOverlay` from v1 `interactions.js` — port into `components/Modal.jsx`.

---

## 8. Definition of done

**Frontend PR**
- [ ] Renders at 1440px, no horizontal scroll at 1024px
- [ ] Sidebar/topbar from shared components; `dataPage` correct; active state right
- [ ] Loading + error + empty states present
- [ ] Data matches context.md §7 (or flags mock usage)
- [ ] All §7 navigation wired; no dead buttons
- [ ] No console errors; no hardcoded colors

**Backend PR**
- [ ] `prisma migrate dev` clean; seed reproduces context.md §7
- [ ] `requireAuth` on all routes except OAuth
- [ ] Service covered by curl examples in PR description
- [ ] Recovery path enforces approval + safety limits (test: reject → nothing executes)
- [ ] No secrets committed; `.env.example` updated if new vars
- [ ] Audit rows written for recovery/rollback

---

## 9. Work split (3 parts)

Full agent-ready briefs: **[parts.md](parts.md)** — one section per coding agent, with strict file ownership (no two parts edit the same file). Read its "Shared contracts" first.

| Part | Scope | Owns (summary) |
|---|---|---|
| **Part 1** | Foundation & Monitoring | Server bootstrap, full Prisma schema + seed, OAuth, auth/monitors/probes/health routes, probe scheduler + anomaly; client foundation (router, components, tokens, api/mock); screens: Login, Onboarding, Dashboard, Monitors, UI States |
| **Part 2** | Incidents & Intelligence | Drift-detection hook, incidents/recovery/recommendations/llm routes, diagnosis + RAG + LLM + recovery services (approval gate & safety); screens: Incidents, Diff & Approval, Recommendations |
| **Part 3** | Operations & Reporting | Telemetry/dependencies/reports/settings/history routes, DNS+SSL checks (scheduled hook), report queries; screens: Telemetry, Dependencies, History & Reports, Settings |

Reviewers: schema/API contracts → Part 1 · diagnosis/recovery logic → Part 2 · data correctness vs context.md → the owning part per section.

---

## 10. Deploy (owner: Part 1) — target **25 Nov**

| Piece | Where | Notes |
|---|---|---|
| Postgres (+pgvector) | Neon free | `DATABASE_URL`, run `prisma migrate deploy` |
| Express API | Render / Railway free | env vars: DB, OAuth, SESSION_SECRET, LLM_API_URL |
| React build | Netlify / Vercel | static build, API URL via env/proxy |
| OAuth | Google + GitHub consoles | add prod redirect URIs **before** demo |

**Demo checklist:** login with Google → REST Countries monitor live → open drift incident → diagnosis + RAG badge → approve recovery → post-check passes → history shows report + 91% vs 64% chart.
