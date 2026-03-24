// =========================================================================
// views/servers.ts — Server list overview
// =========================================================================

import { Servers } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import { setSidebarServers } from "../components/sidebar";
import type { RouteContext } from "../router";
import type { Server } from "../lib/api";

function isOnline(s: Server) {
  return s.last_seen && (Date.now() - s.last_seen) < 90_000;
}

function serverCard(s: Server) {
  const online = isOnline(s);
  return `
    <a href="/servers/${s.id}" class="stat-card ${online ? "green" : ""}" style="display:block;text-decoration:none;cursor:pointer">
      <div class="flex items-center justify-between mb-4">
        <div class="card-title">${s.name}</div>
        <span class="status-pill ${online ? "online" : "offline"}">
          ${online ? "● Online" : "● Offline"}
        </span>
      </div>
      <div class="card-subtitle">${s.description ?? "No description"}</div>
      <div class="flex gap-2 mt-4">
        <span class="badge badge-muted">View Dashboard →</span>
      </div>
    </a>
  `;
}

export async function serversView(ctx: RouteContext): Promise<string> {
  renderTopbar(["GModPanel", "Servers"], ctx.user);
  try {
    const { servers } = await Servers.list();
    setSidebarServers(servers);

    if (servers.length === 0) {
      return `
        <div class="page-header">
          <div class="page-title">Servers</div>
          <div class="page-desc">All your linked Garry's Mod servers</div>
        </div>
        <div class="empty-state">
          <div class="empty-icon">🖥️</div>
          <div class="empty-title">No servers yet</div>
          <div class="empty-desc">Follow the in-game setup instructions to link your first server.</div>
        </div>
      `;
    }

    const online = servers.filter(isOnline).length;
    return `
      <div class="page-header">
        <div class="page-title">Servers</div>
        <div class="page-desc">${servers.length} server${servers.length !== 1 ? "s" : ""} · ${online} online</div>
      </div>
      <div class="grid grid-3">${servers.map(serverCard).join("")}</div>
    `;
  } catch {
    return `<div class="empty-state"><div class="empty-title">Failed to load servers</div></div>`;
  }
}
