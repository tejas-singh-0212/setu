# Setu Self-Healing API Integrations · Frontend Prototype

> **SANGAM Hackathon · PS-10 · Team Vanguard (Team 10)**
> Working frontend prototype of the Setu dashboard  7 screens, mock data, no backend.

**Setu** watches your API integrations, detects when a response schema changes, proposes a fix with human approval, and keeps a full audit log with rollback — plus latency monitoring when responses slow down.

## Screens

| Screen | File | What it shows |
|---|---|---|
| Onboarding | `onboarding.html` | Add your first endpoint (entry point) |
| Dashboard | `dashboard.html` | Endpoint health, stat cards, audit feed, gateways |
| Diff & Approval | `diff-approval.html` | Side-by-side schema diff, AI fix proposal, approve/reject |
| History & Rollback | `history.html` | Schema versions, audit ledger, 1-click rollback |
| Latency | `latency.html` | Telemetry chart, slow-call alerts, suggested remedies |
| Settings | `settings.html` | LLM API key (BYOK), base URL, RAG toggle, thresholds |
| UI States | `ui-states.html` | Empty / loading / error states |

## Tech stack

- **Plain HTML + Tailwind CSS (CDN) + vanilla JS** — no build step, matches our Round 1 plan
- Shared shell (`sidebar` + `topbar`) rendered by `assets/js/shell.js`
- Design tokens in `assets/js/tailwind-config.js`, component classes in `assets/css/components.css`
- **Mock data only** — no API calls, no server

## Quick start

```bash
git clone <your-repo-url>
cd <repo>
python3 -m http.server 5173     # or: npx serve .
# open http://localhost:5173
```

## Structure

```
├── README.md            ← you are here
├── guide.md             ← teammate instructions (start here to contribute)
├── context.md           ← full product/design context for AI agents
├── index.html           ← entry → redirects to onboarding
├── onboarding.html      ← 7 screen files (flat structure, relative paths)
├── dashboard.html
├── diff-approval.html
├── history.html
├── latency.html
├── settings.html
├── ui-states.html
└── assets/
    ├── css/components.css      # shared .btn, .card, .pill classes
    ├── js/tailwind-config.js   # colors & fonts (single source of truth)
    ├── js/shell.js             # sidebar + topbar renderer
    ├── js/interactions.js      # nav helpers, overlays
    └── img/logo.svg
```

## Docs

- **[guide.md](guide.md)** — how to build and ship your screen
- **[context.md](context.md)** — complete app context, design system, mock data (paste this into any AI agent)

## Team Vanguard

Tejas Singh (Leader) · Rudra (Co-leader) · Ayush · Ranvijay · Raj
