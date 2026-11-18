// Setu — shared shell: renders sidebar + topbar into #app-shell
// Do not edit without owner review (see guide.md golden rule #1)

(function () {
  const page = document.body.dataset.page || "";
  if (page === "onboarding") return; // onboarding has no shell
  const active = page === "states" ? "dashboard" : page; // UI-States highlights Dashboard

  const svg = (paths) =>
    `<svg class="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  const icons = {
    dashboard: svg(
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    ),
    approvals: svg(
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    ),
    history: svg(
      '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    ),
    latency: svg('<path d="M3 12h4l3-9 4 18 3-9h4"/>'),
    settings: svg(
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    ),
    doc: svg(
      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    ),
    search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
    bell: svg(
      '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    ),
    chevrons: svg('<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>'),
    diamond: svg('<path d="M12 2 22 12 12 22 2 12z"/>'),
  };

  const nav = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "dashboard.html",
      icon: icons.dashboard,
    },
    {
      id: "diff",
      label: "Approvals",
      href: "diff-approval.html",
      icon: icons.approvals,
      badge: 2,
    },
    {
      id: "history",
      label: "History & Rollback",
      href: "history.html",
      icon: icons.history,
    },
    {
      id: "latency",
      label: "Latency Monitoring",
      href: "latency.html",
      icon: icons.latency,
    },
    {
      id: "settings",
      label: "Settings",
      href: "settings.html",
      icon: icons.settings,
    },
  ];

  const navItems = nav
    .map((item) => {
      const isActive = item.id === active;
      const badge = item.badge
        ? `<span class="badge-count">${item.badge}</span>`
        : "";
      return `
        <a href="${item.href}"
           class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
             isActive ? "bg-brand text-white" : "text-ink hover:bg-slate-100"
           }"
           ${isActive ? 'aria-current="page"' : ""}>
          ${item.icon}<span>${item.label}</span>${badge}
        </a>`;
    })
    .join("");

  const sidebar = `
    <aside class="fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex flex-col z-40">
      <div class="flex items-center gap-3 px-5 pt-5 pb-4">
        <img src="assets/img/logo.svg" alt="Setu" class="w-10 h-10 rounded-lg" />
        <div class="flex items-center gap-2">
          <span class="text-lg font-extrabold tracking-tight">Setu</span>
          <span class="text-[10px] font-bold bg-blue-100 text-brand px-1.5 py-0.5 rounded">PROD</span>
        </div>
      </div>

      <div class="px-4 pb-3">
        <button class="flex items-center gap-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">
          <span class="text-brand">${icons.diamond}</span>
          <span class="flex-1 text-left">Acme Core API</span>
          <span class="text-slate-400">${icons.chevrons}</span>
        </button>
      </div>

      <nav class="px-4 pt-2" aria-label="Workspace">
        <p class="px-3 pb-2 text-[11px] font-bold tracking-wider text-muted uppercase">Workspace</p>
        <div class="flex flex-col gap-1">${navItems}</div>
      </nav>

      <div class="mt-auto px-4 pb-4 pt-6 flex flex-col gap-3 border-t border-slate-100 mx-4">
        <p class="flex items-center gap-2 text-xs text-muted">
          <span class="w-2 h-2 rounded-full bg-ok inline-block"></span> 34 / 34 Endpoints Live
        </p>
        <a href="#" class="flex items-center gap-3 text-sm text-ink hover:text-brand">${icons.doc} Documentation</a>
        <div class="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
          <span class="w-9 h-9 rounded-full bg-navy text-cream flex items-center justify-center text-xs font-bold" style="background:#0F172A">SC</span>
          <span class="leading-tight">
            <span class="block text-sm font-semibold">Sarah Chen</span>
            <span class="block text-xs text-muted">Staff Eng</span>
          </span>
        </div>
      </div>
    </aside>`;

  const topbar = `
    <header class="fixed top-0 left-64 right-0 h-14 z-30 flex items-center gap-4 px-6 bg-cream/95 backdrop-blur border-b border-slate-200/70">
      <div class="flex items-center gap-2 text-sm font-bold shrink-0">
        <span class="text-brand">${icons.search}</span> Setu Studio
      </div>

      <div class="flex-1 max-w-xl mx-auto relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">${icons.search}</span>
        <input type="search" aria-label="Search"
          class="w-full h-9 rounded-lg border border-slate-200 bg-white pl-10 pr-14 text-sm"
          placeholder="Search endpoints, schemas, methods (e.g. /v1/checkout)..." />
        <kbd class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">⌘K</kbd>
      </div>

      <div class="flex items-center gap-3 shrink-0">
        <span class="pill pill-ok">● Healthy (99.98%)</span>
        <div class="flex items-center rounded-lg border border-slate-200 p-0.5 text-[11px] font-bold">
          <span class="bg-brand text-white px-3 py-1 rounded-md">production</span>
          <span class="px-3 py-1 text-muted">staging</span>
        </div>
        <button class="relative text-ink hover:text-brand" aria-label="Notifications">
          ${icons.bell}
          <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-bad"></span>
        </button>
        <button class="btn-secondary !py-1.5 !px-3 text-xs">Feedback</button>
      </div>
    </header>`;

  const root = document.getElementById("app-shell");
  if (root) root.innerHTML = sidebar + topbar;
})();
