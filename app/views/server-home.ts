// =========================================================================
// views/server-home.ts — Live server overview (map, players, FPS)
// =========================================================================

import { Servers } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import { navigate, type RouteContext } from "../router";
import { setSidebarServers } from "../components/sidebar";

export async function serverHomeView(ctx: RouteContext): Promise<string> {
  const id = ctx.params.id;
  renderTopbar(["Servers", id], ctx.user);

  try {
    const { live, online } = await Servers.live(id);

    const tabs = serverTabs(id, "overview");
    if (!online || !live) {
      return `${tabs}
        <div class="empty-state">
          <div class="empty-icon"><i data-lucide="wifi-off"></i></div>
          <div class="empty-title">Server is offline</div>
          <div class="empty-desc mb-4">The GMod server is not sending heartbeats. Check if the addon is running.</div>
          <button class="btn btn-danger" id="delete-server-btn" data-id="${id}"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Delete Server</button>
        </div>`;
    }

    return `
      ${tabs}
      <div class="grid grid-4 mb-6">
        <div class="stat-card cyan">
          <div class="stat-icon"><i data-lucide="users"></i></div>
          <div class="stat-label">Players</div>
          <div class="stat-value">${live.player_count}<span style="font-size:16px;font-weight:400;color:var(--text-muted)">/${live.max_players}</span></div>
          <div class="stat-sub">Online now</div>
        </div>
        <div class="stat-card purple">
          <div class="stat-icon"><i data-lucide="map"></i></div>
          <div class="stat-label">Map</div>
          <div class="stat-value" style="font-size:16px;letter-spacing:-0.3px">${live.map}</div>
          <div class="stat-sub">${live.gamemode}</div>
        </div>
        <div class="stat-card green">
          <div class="stat-icon"><i data-lucide="activity"></i></div>
          <div class="stat-label">Server FPS</div>
          <div class="stat-value">${live.fps}</div>
        </div>
        <div class="stat-card yellow">
          <div class="stat-icon"><i data-lucide="clock"></i></div>
          <div class="stat-label">Last Update</div>
          <div class="stat-value" style="font-size:16px">${timeAgo(live.ts)}</div>
          <div class="stat-sub">Heartbeat</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Live Players (${live.player_count})</div>
          <a href="/servers/${id}/players" class="btn btn-ghost btn-sm">Full list <i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i></a>
        </div>
        <div class="event-feed">
          ${live.players.length === 0
        ? `<div class="empty-state" style="padding:32px"><div class="empty-desc">No players online</div></div>`
        : live.players.map(p => `
              <div class="player-card">
                <div class="player-avatar"></div>
                <div>
                  <div class="player-name">${p.name}</div>
                  <div class="player-info">${p.steamid} · ${p.ping}ms · ${p.team}</div>
                </div>
                <div class="player-actions">
                  <a href="/servers/${id}/commands" class="btn btn-sm btn-danger">Kick</a>
                </div>
              </div>
            `).join("")
      }
        </div>
      </div>

      <div class="card" style="border-color: var(--red); background: rgba(220, 38, 38, 0.05); margin-top: 24px;">
        <div class="card-header">
          <div class="card-title" style="color: var(--red); display: flex; align-items: center; gap: 6px;">
            <i data-lucide="alert-triangle" style="width: 16px; height: 16px;"></i> Danger Zone
          </div>
        </div>
        <div style="padding: 16px; display: flex; align-items: center; justify-content: space-between;">
          <div class="text-sm">Permanently remove this server from your dashboard.</div>
          <button class="btn btn-danger" id="delete-server-btn" data-id="${id}"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Delete Server</button>
        </div>
      </div>
    `;
  } catch {
    return `<div class="empty-state"><div class="empty-title">Failed to load server data</div></div>`;
  }
}

// -------------------------------------------------------------------------
// Shared tab bar for server sub-views
// -------------------------------------------------------------------------

export function serverTabs(id: string, active: string) {
  const tabs = [
    { key: "overview", label: "Overview", href: `/servers/${id}`, icon: "activity" },
    { key: "players", label: "Players", href: `/servers/${id}/players`, icon: "users" },
    { key: "events", label: "Events", href: `/servers/${id}/events`, icon: "terminal" },
    { key: "commands", label: "Commands", href: `/servers/${id}/commands`, icon: "server" },
    { key: "warnings", label: "Warnings", href: `/servers/${id}/warnings`, icon: "alert-triangle" },
    { key: "stats", label: "Stats", href: `/servers/${id}/stats`, icon: "bar-chart-2" },
  ];
  return `
    <div class="tab-bar">
      ${tabs.map(t => `<a href="${t.href}" class="tab ${t.key === active ? "active" : ""}"><i data-lucide="${t.icon}" style="width: 14px; height: 14px; margin-right: 6px; margin-bottom: -2px;"></i>${t.label}</a>`).join("")}
    </div>
  `;
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// We use a global listener to ensure it's not lost on re-renders
if (!(window as any)._gmpDeleteServerBound) {
  (window as any)._gmpDeleteServerBound = true;
  document.addEventListener("click", async (e) => {
    const btn = (e.target as Element).closest("#delete-server-btn");
    if (!btn) return;

    const id = btn.getAttribute("data-id");
    if (!id) return;

    if (!confirm("Are you sure you want to permanently delete this server? This action cannot be undone.")) return;

    const originalText = btn.textContent;
    btn.textContent = "Deleting...";
    (btn as HTMLButtonElement).disabled = true;

    try {
      await Servers.delete(id);

      // Update sidebar
      try {
        const { servers } = await Servers.list();
        setSidebarServers(servers);
      } catch { }

      navigate("/servers", true);
    } catch (err: any) {
      alert("Failed to delete server: " + err.message);
      btn.textContent = originalText;
      (btn as HTMLButtonElement).disabled = false;
    }
  });
}

export function serverHomeAfter(ctx: RouteContext) {
  // Initialization done globally
}
