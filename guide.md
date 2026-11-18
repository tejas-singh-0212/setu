# Setu Frontend Teammate Guide

How to build and ship your screen. Read once, keep it open while you work.

---

## 1. Setup (once)

```bash
git clone <repo-url>
cd <repo>
python3 -m http.server 5173     # or: npx serve .
# open http://localhost:5173
```

No build step, no npm install. Everything is static HTML + Tailwind (CDN) + vanilla JS.
**Always work on a branch:** `git checkout -b feat/<your-screen>` → commit → push → open PR.

---

## 2. Folder structure

```
setu-frontend/
├── README.md                # repo overview
├── guide.md                 # this file
├── context.md               # full app + design context → paste into AI agents
├── index.html               # entry → forwards to onboarding.html
│
├── onboarding.html          # 7 screens — one file each, flat at root
├── dashboard.html
├── diff-approval.html
├── history.html
├── latency.html
├── settings.html
├── ui-states.html
│
└── assets/
    ├── css/
    │   └── components.css    # shared classes: .btn-primary, .card, .pill…
    ├── js/
    │   ├── tailwind-config.js  # ALL colors/fonts — single source of truth
    │   ├── shell.js            # renders sidebar + topbar
    │   └── interactions.js     # nav helpers, overlay open/close
    └── img/
        └── logo.svg
```

---

## 3. Golden rules (break these = PR rejected)

1. **Never edit** `shell.js`, `tailwind-config.js`, or another screen's file. Shell/topbar are shared — they're identical on every screen by design.
2. **One screen = one file.** Put your HTML in your assigned root file only.
3. **Colors/type only via Tailwind tokens** (`bg-cream`, `text-brand`, `font-mono`…) — never hardcode `#hex` or `font-family`.
4. **Reuse component classes** from `components.css` (`.btn-primary`, `.btn-secondary`, `.btn-danger`, `.card`, `.pill-ok/warn/bad/ai`, `.stat-card`, `.table-base`) instead of restyling buttons/cards from scratch.
5. **Copy mock data verbatim from `context.md` §3** — same endpoints, names, numbers on every screen. Never invent data.
6. **No new pages, no login, no dark mode.** Only the 5 nav items that already exist in the sidebar.
7. Every page starts with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Setu — <Screen Name></title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="assets/js/tailwind-config.js"></script>
  <link rel="stylesheet" href="assets/css/components.css" />
</head>
<body data-page="dashboard" class="bg-cream text-ink font-sans">
  <div id="app-shell"></div>          <!-- sidebar + topbar injected by shell.js -->
  <main class="ml-64 pt-14 ...">     <!-- your content; ml-64 clears sidebar, pt-14 clears topbar -->
    ...
  </main>
  <script src="assets/js/shell.js"></script>
  <script src="assets/js/interactions.js"></script>
</body>
</html>
```

`data-page` values: `onboarding` (shell omitted) · `dashboard` · `diff` · `history` · `latency` · `settings` · `states`.

---

## 4. How to build your screen with an AI agent

Give the agent **all three inputs in one message**:

1. `context.md` - the whole file (it contains your screen's exact spec in §3)
2. The reference screenshot of your screen (from Figma export / `docs/screenshots/`)
3. This instruction:

> "Build `<your-screen>.html` for the Setu frontend. Follow context.md §3.X exactly — layout, sections, text, and mock data. Use only the shared classes in components.css and Tailwind tokens. Include the shell markup from guide.md §3. Do not add screens, routes, or data."

Then **review the output yourself** - AI gets ~90% right; check:
- [ ] All text/numbers match context.md (no invented data)
- [ ] Uses `data-page` correctly and includes shell markup
- [ ] Buttons that should navigate have `href` to the right file (see §5)
- [ ] No hardcoded hex colors, no extra fonts, no dark mode

---

## 5. Navigation map (wire real `<a href>` / `<button onclick>`)

| From | Element | Goes to |
|---|---|---|
| any | sidebar item | its `.html` file |
| Dashboard | Review Diff, Pending Approvals, audit "Review →" | `diff-approval.html` |
| Dashboard | Inspect, High Latency Alert | `latency.html` |
| Dashboard | Add Endpoint, empty-state Add Endpoint | `onboarding.html` |
| Dashboard | Trigger Scan Now | `ui-states.html` |
| Dashboard | Fix Approved / Rollback Executed / View Audit Trail | `history.html` |
| Diff-Approval | Approve & Apply → dialog Confirm & Deploy | `history.html` |
| Diff-Approval | Reject Change, Cancel | `dashboard.html` (Cancel closes dialog) |
| Diff-Approval | View rollback point | `history.html` |
| History | Prepare Rollback / Quick Revert → confirm | `dashboard.html` |
| Latency | Apply Remedy, Suggest Fix | `diff-approval.html` |
| Latency | Configure Timeout / Retry Policy | `settings.html` |
| Settings | Save Changes, Discard | `dashboard.html` |
| UI-States | Add Endpoint | `onboarding.html` |
| UI-States | Retry | `dashboard.html` |
| Onboarding | Start Monitoring | `dashboard.html` |

Overlays (Diff confirm dialog): build as a hidden `<div>` in your file, toggle with `interactions.js` → `openOverlay('id')` / `closeOverlay('id')`.

---

## 6. Definition of done (before you open a PR)

- [ ] Renders correctly at 1440px and doesn't break at 1024px (no horizontal scroll)
- [ ] Shell (sidebar + topbar) visible and identical to other screens — you didn't touch `shell.js`
- [ ] All navigation from §5 present and working
- [ ] Data matches `context.md` exactly
- [ ] Status = color **+** text (never color alone); buttons are real `<button>`/`<a>`
- [ ] No console errors; no hardcoded colors; no lorem ipsum
- [ ] Screenshots attached to PR

---

## 7. Screen assignment

| Screen | File | Owner | Status |
|---|---|---|---|
| Onboarding | `onboarding.html` | _TBD_ | ⬜ |
| Dashboard | `dashboard.html` | _TBD_ | ⬜ |
| Diff & Approval | `diff-approval.html` | _TBD_ | ⬜ |
| History & Rollback | `history.html` | _TBD_ | ⬜ |
| Latency | `latency.html` | _TBD_ | ⬜ |
| Settings | `settings.html` | _TBD_ | ⬜ |
| UI States | `ui-states.html` | _TBD_ | ⬜ |

**Reviewers:** shell/tokens/components changes → Tejas. Data correctness vs context.md → Rudra.

---