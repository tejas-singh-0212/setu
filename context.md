# Setu Complete Context (for AI agents & teammates)

> Paste this whole file into any AI agent before asking it to build a screen.

---

## 1. What is Setu?

**Problem:** Business integrations break silently when an API provider renames, removes, or retypes a response field. The response still returns 200 OK, so data corrupts for days before anyone notices. Fixes are manual, unlogged, and unversioned.

**Solution:** Setu monitors API responses against an expected schema, detects and classifies changes, has an LLM propose a mapping fix, and a **human approves** it in a dashboard. Every approved fix is versioned in an audit log and can be **rolled back** in one click. Setu also tracks **response latency** and raises alerts with suggested remedies when calls get slow.

**This repo:** the **working frontend prototype** — 7 static screens with mock data. No backend, no real API calls, no authentication.

### Core product concepts (use this vocabulary everywhere)
- **Schema drift** — a response no longer matches the expected schema. Types: **renamed**, **removed**, **type-changed** fields
- **Approval gate** — nothing is applied without a human clicking Approve; this is our key differentiator
- **AI fix proposal** — LLM (user's own API key) generates a mapping fix from the classified diff; shown with an "AI-generated" badge
- **RAG-lite** — past approved fixes are retrieved from local history and injected into the prompt (toggle in Settings)
- **BYOK (bring your own key)** — user enters API key + base URL in Settings; "stored locally, never leaves your machine"
- **Rollback** — restore any previous schema version from a snapshot
- **Latency rules** — alert when a call > threshold (default 1,000 ms) or **N consecutive** slow calls (default 3); remedies: increase timeout, retry with backoff, cache responses

---

## 2. Design system

### Colors (defined in `assets/js/tailwind-config.js`)
| Token | Value | Use |
|---|---|---|
| `cream` | `#F7F1E8` | page background |
| `surface` | `#FFFFFF` | cards, sidebar, tables |
| `brand` | `#2563EB` | primary buttons, active nav, links |
| `brand-dark` | `#1D4ED8` | button hover |
| `ink` | `#0F172A` | headings, primary text |
| `muted` | `#64748B` | secondary text, labels |
| `ok` | `#16A34A` | healthy, success |
| `warn` | `#D97706` | slow, warning |
| `bad` | `#DC2626` | drift, error, danger |
| `ai` | `#7C3AED` | AI-generated badges only |

### Typography & shape
- Font: **Inter** (Google Fonts) for UI; `font-mono` for schemas, code, paths, keys
- Card radius: `rounded-2xl` (16px); buttons/pills: `rounded-lg` (8px); pills: `rounded-full`
- Cards: white, `border border-slate-200`, subtle shadow, padding `p-5`/`p-6`
- Page background is **cream**; content sits in white cards — never put content directly on cream without a card

### Shared shell (rendered by `shell.js` — do not rebuild per screen)
- **Sidebar (left, w-64, white):** logo + "Setu PROD" → workspace selector "Acme Core API" → label WORKSPACE → nav: **Dashboard, Approvals (red badge "2"), History & Rollback, Latency Monitoring, Settings** → bottom: "34 / 34 Endpoints Live", Documentation, user card **Sarah Chen · Staff Eng**
  - Active item: blue background, white text, `rounded-lg`
- **Top bar:** "Setu Studio" · center search "Search endpoints, schemas, methods (e.g. /v1/checkout)..." with ⌘K · green pill "● Healthy (99.98%)" · **production | staging** toggle (production active, blue) · bell icon · "Feedback" button

### Component classes (in `assets/css/components.css`)
`.btn-primary` (blue, white text) · `.btn-secondary` (white, border) · `.btn-danger` (white/red) · `.card` · `.pill` + `.pill-ok/.pill-warn/.pill-bad/.pill-ai` · `.stat-card` · `.table-base` · `.badge-count` (red nav badge)

### Accessibility (rubric requirement)
- Body text ≥ 14px; headings readable; never light-grey on white for essential text
- Status must use **color + text** together (e.g. red dot + "Schema Drift"), never color alone
- All buttons must be real `<button>`/`<a>`, keyboard-focusable

---

## 3. Screen specs (7 screens)

Each screen = one root HTML file. Every screen except Onboarding includes the shared shell.
Body attribute: `<body data-page="dashboard|diff|history|latency|settings|states|onboarding">`.

### 3.1 Onboarding — `onboarding.html` (no sidebar)
- Split layout: left = logo + headline **"Reliable APIs. Stronger connections."** + sub "Connect your first endpoint and give every request a more reliable path."
- Right = white/cream card: chip "STEP 1 OF 1" → h1 **"Add your first endpoint"** → sub "Start with a base URL. SETU will take it from here."
- Fields: **Base URL** (placeholder `https://api.example.com`, helper "The root URL of the API you want to monitor.") · **HTTP method** dropdown (GET selected)
- Primary blue button **"Start Monitoring"** (→ `dashboard.html`) · helper "You can add more endpoints after setup." · footer "SETU / Self-healing API integration"

### 3.2 Dashboard — `dashboard.html`
- Page header: **"API Integration Health"** + green chip "● Live Ingestion Active"; sub "Watching **34 production endpoints** across 4 upstream partners · Last scan 42s ago"; right: `.btn-secondary` **"⟳ Trigger Scan Now"** (→ `ui-states.html`) + `.btn-primary` **"+ Add Endpoint"** (→ `onboarding.html`)
- **4 stat cards:** ① ENDPOINTS MONITORED `34` (+2 this week, 100% telemetry coverage, 0 skipped) ② PENDING APPROVALS `2` red "Action Required" (1 breaking schema drift, 1 type mismatch) ③ SCHEMA CHANGES (7D) `11` (9 fixes applied, 2 awaiting action, avg human review time 4.2m) ④ AVG RESPONSE TIME `142ms` (green −18ms, 99th percentile: 380ms)
- **Endpoint table** (card): filter input "Filter endpoint name or path..." + method chips ALL/GET/POST/PUT/DEL + "All Statuses" dropdown. Columns: ENDPOINT · METHOD · STATUS · LATENCY (10M) · LAST SEEN · ACTIONS. Rows (canonical data):

| Endpoint | Path | Method | Status | Latency | Last seen | Action |
|---|---|---|---|---|---|---|
| Stripe Webhook Listener | /api/v2/webhooks/stripe | POST | ● Schema Drift (red) | 194ms | 12s ago | Review Diff → `diff-approval.html` |
| Customer Billing Sync | /api/v1/customers/billing | GET | ● Slow (1,480ms) (amber) | 1,480ms | 34s ago | Inspect → `latency.html` |
| Identity Verification Core | /v3/kyc/verify | POST | ● Healthy | 184ms | 45s ago | ⋯ (none) |
| Orders & Cart Stream *(chip "healed")* | /v2/checkout/session | POST | ● Healthy | 92ms | 1m ago | ⋯ (none) |
| Inventory Stock Poll | /api/v1/warehouse/sync | GET | ● Schema Drift (red) | 310ms | 2m ago | Review Diff → `diff-approval.html` |
| Logistics Rates Calculator | /v1/shipping/quote | PUT | ● Healthy | 210ms | 4m ago | ⋯ (none) |

Footer: "Showing **6 of 34** configured routes" · Previous 1/6 Next. Latency column = small sparkline (green line healthy, red when drift, amber when slow).
- **Right column — Recent Audit Feed** (card, header "● Live log"):
  1. **Schema Drift Detected** (red) 2m ago — `/api/v2/webhooks/stripe` missing payload key `customer_tax_id`. Actor: System Watcher · **Review →** → `diff-approval.html`
  2. **Fix Approved & Applied** (violet) 14m ago — Sarah Chen approved autonomic LLM schema remediation for `/v2/checkout/session`. Approver: Sarah Chen · #pr-4029 → `history.html`
  3. **High Latency Alert** (violet) 1h ago — `/api/v1/customers/billing` exceeded 1,000ms threshold for 3 consecutive automated polls. Actor: System Watcher → `latency.html`
  4. **Rollback Executed** (grey) 3h ago — Alex Rivera rolled back `/v3/kyc/verify` to validated schema v2. v2.1.0 → v2.0.4 → `history.html`
  5. **Auto-healing Verified** (green) 5h ago — LLM mapping verified with 0% error rate across 1,000 synthetic test assertions. Actor: LLM Healer
  - Footer button: **"View Complete Audit Trail (420 events)"** → `history.html`
- **Right column — Upstream Gateways** (card, "4 Connected"): Stripe Production Core 99.99% (green) · Plaid Auth Cluster *Degraded* (violet dot) · Twilio Verify API 100.0% (green) · AWS API Gateway 99.98% (green)
- **Pending Approvals** stat card → `diff-approval.html`

### 3.3 Diff & Approval — `diff-approval.html`
Top → bottom:
1. Breadcrumb: Approvals / Stripe Webhook Listener `/api/v2/webhooks/stripe` · right: red "● Live telemetry incident #TNC-8821"
2. Blue info banner: **"Safety Guardrail Active:** Nothing applies to your live gateway or serialization layer without explicit human sign-off." + right chip "Gateway sandbox isolated"
3. Chips: red **"Renamed Field & Removed Field"** · "Detected 4 minutes ago" · "⚡ Impact: 420 req/min affected"
4. H1 **"Schema Drift Detected in"** + code chip `customer.subscription.updated`; sub "Inbound payload structure diverged from contract snapshot v3.2. Downstream billing ingestion queues are currently dropping unrecognized properties."
5. Right mini-stats: DROPPED KEYS `1` · REMAPPED `2` · AI MATCH `94%`
6. **AST Contract Diff card** (header "AST Contract Diff · JSON Schema Draft-07", right: Split Diff/Unified toggle + download):
   - Two columns: **Expected Schema v3.2 (Production Contract)** `#8a4f79 ACTIVE` | **Detected Schema v4.0 (Live Upstream Response)** "⚠ Breaking changes detected"
   - Monospace JSON with line numbers; highlights: red = removed (`tax_exempt` "[REMOVED UPSTREAM]"), blue/amber = renamed (`customer_id` → `account_reference`; `billing_cycle_anchor` type `string` → `integer, unix-epoch`), green = added (`automatic_tax_status` + enum)
   - Legend: • Removed (1) • Renamed (1) • ⚡ Type Shift (1) • + Added (1) · right: "AST Depth: 3 levels · Parser latency: 1.2ms"
7. **AI proposal card:** violet badge **"AI-generated · RAG from your fix history (94% confidence)"** + chip "Target: Setu transform layer" + right "● Zero Downtime Migration Validated"
   - H2 **"Autonomic AST Transform Adapter Proposal"**; sub "Generated via LLM using your API key using 8 past approved Stripe webhook mappings in your repo."
   - Dark code block (`stripe_subscription_adapter.ts`, tabs TS 5.4, Copy / Test Runner) — TypeScript that remaps `account_reference → customer_id`, coerces `billing_cycle_anchor`, synthesizes `tax_exempt` fallback
   - Green strip: "✓ Dry-run passed on 50 sampled staging payloads · 0 errors" · right "Avg latency overhead: +0.42ms"
   - Footer: "Model matched 2 existing TypeScript mappings from `packages/payments-gateway`" + buttons **Customize AST** · **Regenerate (Python)**
8. **Approval dialog section** "Deployment Verification Preview" — modal card titled **"Approve & Apply Fix"** (Esc chip):
   - TRANSFORMATIONS TO APPLY: ↳ Remap `account_reference → customer_id` (String invariant) · ⊕ Coerce `billing_cycle_anchor`: Unix Timestamp (int) → ISO 8601 string · ◇ Synthesize default `tax_exempt` from `automatic_tax_status`
   - Authorizing Engineer: **Sarah Chen (Staff Engineer)** · Rollback Guarantee: **Instant 1-click rollback (30 days)**
   - Buttons: **Cancel** (secondary) · **Confirm & Deploy (⌘ ↵)** (primary) — in prototype: Confirm → `history.html`, Cancel → close overlay
9. Sticky bottom bar: **"View rollback point (#snap_9921)"** (secondary) · **"✕ Reject Change"** (secondary) · **"Approve & Apply Adapter to Gateway"** (primary, opens the dialog as overlay)

### 3.4 History & Rollback — `history.html`
1. Eyebrow "AUDITING ENGINE / ROLLBACK LEDGER" · H1 **"Schema History & Rollback Points"** · sub "Track all upstream schema evolutions, human approvals, and instant 1-click rollback snapshots." · right: endpoint selector "Target Endpoint /api/v2/webhooks/stripe — Stripe Listener" + download icon
2. **Contract Evolution Ribbon** card ("4 snapshots recorded", right "● Gateway sync: Instantaneous (<250ms)"): 4 version cards — `v1.0` Nov 12 Initial Contract (Archived Base, 24 fields, adapter v1.0.0) · `v2.1` Jan 04 Currency Support (Superseded Safe, 28 fields, adapter v2.1.4) · `v3.2` Feb 18 **Current Active Prod** (green "● LIVE NOW" badge, 100% Edge Gateways, 34 fields · 6 rules, adapter v3.2.0) · `v4.0-rc1` Today 14:10 Staged Adapter Draft (Pending 2 Approvals, 37 fields (+3 synthesized), adapter v4.0-rc)
3. Filters row: Last 30 Days · Events: All Types · Actor: All Entities · search "Filter snapshot ID or note.."
4. **Snapshots table:** TIMESTAMP · SNAPSHOT / VER · EVENT · ACTOR & CONTEXT · GATEWAY HEALTH. Rows:
   - Today 14:22:04 (12 mins ago) · #snap_9921 v4.0-rc1 · ● Detected Drift (red) · LLM Healer (3.5) Synthesized adapter · Dry-run Validated
   - Feb 18 08:44:19 (6 days ago) · #snap_9104 v3.2 (Active) · Approved & Live (green) · Sarah Chen Manual PR #419 · 100% Traffic Healthy
   - Jan 04 11:15:30 (1 month ago) · #snap_8812 v2.1 · Superseded (grey) · Alex Rivera Added currency ISO · Stable archive
   - Dec 19 21:02:11 (2 months ago) · #snap_7420 v2.0-bad · Rolled Back (violet) · CLI Agent (CI/CD) Automated Latency Revert · Reverted safely
   - Nov 12 10:00:00 (3 months ago) · #snap_5011 v1.0 · Genesis Commit (blue) · Sarah Chen Imported Stripe OAS3 · Archived
   - Footer: "Showing 5 of 28 snapshots · All rollback images stored in local snapshot store" · Previous 1 2 3 Next
5. **Snapshot Inspector** (right card): chip `#snap_8812 (v2.1)` · H3 "Currency Support Patch" · description "Introduced ISO 4217 standard 3-letter currency definitions and fallback handling for non-US accounts." · SCHEMA DELTA (V2.1 vs CURRENT V3.2) mini-diff (red −, green + lines) · stats: 14.2 ms Avg Gateway Latency · 0.00% Error Rate (Historic) · primary button **"Prepare Rollback to #snap_8812"** (opens confirm overlay)
6. **Fast Rollback Guarantee** card: "Setu restores the previous verified schema version directly from local snapshots with zero downtime." · Snapshot Restore Time ~180ms · Traffic Drop Potential: Zero (Hitless swap) · Validation: Instant validation / schema dry-run
7. Sticky bottom bar: "● Rollback snapshot engine ready" · **"↺ Quick Revert (v2.1)"** (opens same overlay) · **"⬇ Download Audit Bundle"** (no link)

### 3.5 Latency — `latency.html`
1. Eyebrow "TELEMETRY / REAL-TIME SYNTHETICS" · H1 **"API Latency & Performance Telemetry"** · right: time chips 1h 6h **24h** 7d 30d + endpoint dropdown `/api/v1/customers/billing — Customer Billing Sync` · chip "● Live stream 5s"
2. **4 stat cards:** CURRENT P50 LATENCY `124ms` (Normal, −12ms vs yesterday) · CURRENT P99 LATENCY `1,480ms` red (Degraded (+48%), Threshold: 1,000ms) · SLA BREACHES (24H) `14 events` (99.41% Compliant, Target: 99.9%) · ERROR / TIMEOUT RATE `0.12%` (Within Budget, Max allowed: 0.5%)
3. **24-Hour Telemetry Curve** card (chip "Percentile 99"): line chart, p99 curve (blue) + dashed red SLA threshold line at 1,000ms + shaded red "DEGRADED ZONE (>1,000ms)" + red breach dot with tooltip "14:18 UTC · p99 Outlier · 1,480ms (3 calls > 1,000ms) · Upstream database lock detected"; legend: p99 Response Curve / SLA Threshold (1,000ms) / Breach Incident
4. **Active Alert card:** red icon + **"Active Alert: 3 Consecutive Slow Calls Exceeding 1,000ms"** + chip "Critical P1" · sub "Upstream `/api/v1/customers/billing` is bottlenecked on third-party invoice calculation." · right "Triggered 4m ago" + "Silence (15m)" button
5. **3 remedy cards:** REMEDY A "Increase Client Timeout" (Timeout: 2500ms → 5000ms, description, button **Configure Timeout** → `settings.html`) · REMEDY B "Add Retry with Exponential Backoff" (3 retries, jittered 200ms, button **Configure Retry Policy** → `settings.html`) · REMEDY C **"Cache Idempotent Responses"** (violet "Recommended" badge, Redis TTL: 120s, description, primary button **"⚡ Apply Remedy to Proxy"** → `diff-approval.html`)
6. **Slow-Call Log Table** (chip "Last 50 calls > 800ms", right: Filter by Host · Export HAR): TIMESTAMP · ENDPOINT · REQUEST ID · DURATION · HTTP STATUS · UPSTREAM HOST · ACTION. Rows: 14:18:22.409 billing 1,480ms 200 OK · 14:18:19.112 billing 1,620ms **504 Gateway Timeout** (red) · 14:18:14.887 billing 1,210ms 200 OK · 14:12:05.610 checkout 910ms 200 OK · 13:58:44.204 ledger 845ms 200 OK · ACTION = **View Details** button per row (no link needed)
7. Sticky bottom bar: "● Auto-healing rule staged · Redis TTL cache ready to deploy to 14 Edge Gateways" · primary **"Suggest Fix (opens approval)"** → `diff-approval.html`

### 3.6 Settings — `settings.html`
1. Card header: blue dot "WORKSPACE PREFERENCES / SETU CORE V2.4" · H1 **"Platform & Monitoring Settings"** · sub "Configure LLM inference, telemetry threshold rules, and privacy safety controls." · right: **Discard** (→ `dashboard.html`) + **Save Changes** (primary, → `dashboard.html`)
2. Tabs: General · **✦ LLM & AI Engine** (active, blue underline/dot) · Telemetry Rules · Team & Webhooks · Danger Zone (red text) — tabs are visual only, no links
3. **Inference Engine & RAG Context** card (chip "v0.18.2 Runtime"):
   - Sub "Configure the model used to synthesize schema adapter transforms and latency remedies."
   - **API Key *** + green chip "Keychain Protected": masked input `sk-ant-••••••••494bF` with 👁 + copy icons · helper "🔒 Stored locally in your secure keychain / enclave — never leaves your machine."
   - **Inference Base URL** (right label "OpenAI / Anthropic Compatible"): input `https://api.anthropic.com/v1`
   - **Primary Model Archetype:** dropdown **"Custom model (OpenAI-compatible)"**
   - Toggle row (ON, blue): **"Use past approved fixes as RAG context"** + chip DYNAMIC · "Injects verified adapter history and schema naming conventions into the synthesis prompt for higher precision."
4. **Detection Thresholds & Polling Engine** card:
   - **Latency Degradation Threshold** — value `1,000 ms` (blue, right) · sub "Mark endpoints as degrading when response p95 exceeds this limit." · slider with marks 250ms / 500ms / **1,000ms** / 2,000ms
   - Two boxes: **Consecutive Slow Calls Alert Trigger** "Dispatches PagerDuty / Slack escalation." stepper `− 3 consecutive calls +` · **Schema Inspection Frequency** "Payload sampling method across edge nodes." dropdown "Real-time edge telemetry (inline)"
5. **Danger Zone** card (red heading, chip CAUTION): "Irreversible actions for your workspace audit log and historical adapter cache." · row **"Clear Audit Log & Reset Historical Schemas"** — "Purges all 1,420 historical snapshots and trained RAG embeddings. This will cause model drift on customized JSON transformations." + red-outline button **Clear Audit Log** (no link needed)

### 3.7 UI States — `ui-states.html`
- H1 **"UI states"** · sub "Empty, loading, and error states across your API workspace."
- **01 / EMPTY STATE** (chip "No data"): centered **"No endpoints yet"** + "Add your first endpoint to start tracking schema changes." + primary **"Add Endpoint"** → `onboarding.html`
- **02 / LOADING** (chip "In progress"): **"Generating diff…"** + right "Acme Core API · production · Sample data" · table ENDPOINT/METHOD/LAST UPDATED/STATUS: `/v1/checkout` POST Just now **Comparing…** (blue) · `/v1/payments/{id}` GET 2 minutes ago Queued · `/v1/webhooks` POST 5 minutes ago Queued
- **03 / ERROR** (chip "Connection lost"): red banner **"Lost connection to API — Retry"** (Retry underlined, → `dashboard.html`) · sub "Check your connection, then retry to reconnect to Acme Core API."
- *(Optional)* After-delay 2000ms on the frame → `dashboard.html`

---

## 4. Canonical mock rules

- Workspace **"Acme Core API"**, environment **production**, user **Sarah Chen (Staff Eng)**, secondary actor **Alex Rivera**, bot actors: **System Watcher**, **LLM Healer**, **CLI Agent (CI/CD)**
- Never invent endpoints, names, numbers, or paths not in this file — screens must tell one consistent story (Stripe webhook drift, billing latency, KYC rollback)
- Currency of story: dashboard "2 pending approvals" = the Stripe drift (screen 3) + 1 type mismatch
- All timestamps English relative ("12s ago", "2m ago") or the exact dates in §3.4

## 5. Out of scope (do NOT build)

- No backend, no real API calls, no login/auth, no real charts library (draw charts with inline SVG)
- No new screens, no dark mode, no extra nav items beyond the 5 in the shell
- No emoji as icons where a simple SVG works; icons = inline SVG or a single icon font (Lucide via CDN allowed)
