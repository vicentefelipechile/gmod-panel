// =========================================================================
// components/sidebar.ts — Sidebar component: brand, nav links, server list
// =========================================================================

import { navigate } from "../router";
import { refreshIcons } from "../lib/icons";
import type { Server } from "../lib/api";
import type { Me } from "../lib/api";

let servers: Server[] = [];

export function setSidebarServers(s: Server[]) {
  servers = s;
  renderServerList();
}

function renderServerList() {
  const el = document.getElementById("sidebar-server-list");
  if (!el) return;
  el.innerHTML = servers.map(s => `
    <div class="sidebar-server-item" data-href="/servers/${s.id}">
      <span class="sidebar-server-dot ${s.last_seen && (Date.now() - s.last_seen) < 90000 ? "online" : "offline"}"></span>
      <span class="truncate">${s.name}</span>
    </div>
  `).join("") || `<div class="text-muted text-sm" style="padding:6px 10px">No servers</div>`;
}

export function renderSidebar(user: Me | null) {
  const el = document.getElementById("sidebar")!;
  el.innerHTML = `
    <div class="sidebar-brand">
      <div class="sidebar-brand-mark">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
        </svg>
      </div>
      <span class="sidebar-brand-name">GModPanel</span>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-section-label">Navigation</div>
      <div class="sidebar-nav-item" data-href="/servers">
        <i data-lucide="server"></i> Servers
      </div>
      <div class="sidebar-nav-item" data-href="/settings">
        <i data-lucide="settings"></i> Settings
      </div>
    </div>

    ${user ? `
    <div class="sidebar-section">
      <div class="sidebar-section-label">Your Servers</div>
      <div class="sidebar-server-list" id="sidebar-server-list"></div>
    </div>` : ""}

    <div class="sidebar-footer">
      ${user ? `
        <div class="sidebar-server-item" data-href="/settings">
          <img class="player-avatar" src="${user.avatar_url ?? ""}" alt="avatar" style="width:22px;height:22px;border-radius:4px;object-fit:cover">
          <span class="truncate" style="font-size:12.5px">${user.display_name}</span>
        </div>
      ` : `
        <div class="sidebar-nav-item" data-href="/login">
          <i data-lucide="log-in"></i> Login
        </div>
      `}
    </div>
  `;

  // Attach nav click handlers via event delegation
  el.addEventListener("click", (e) => {
    const item = (e.target as Element).closest("[data-href]");
    if (!item) return;
    const href = (item as HTMLElement).dataset.href!;
    navigate(href);
  });

  refreshIcons();
  if (user) renderServerList();
}

export function highlightSidebarItem(path: string) {
  document.querySelectorAll(".sidebar-nav-item, .sidebar-server-item").forEach(el => {
    el.classList.remove("active");
    const href = (el as HTMLElement).dataset.href ?? "";
    if (path.startsWith(href) && href !== "/") el.classList.add("active");
    if (href === "/" && path === "/") el.classList.add("active");
  });
}
