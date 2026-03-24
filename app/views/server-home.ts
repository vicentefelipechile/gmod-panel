// =========================================================================
// views/server-home.ts — Live server overview (map, players, FPS)
// =========================================================================

import { Servers } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import type { RouteContext } from "../router";

export async function serverHomeView(ctx: RouteContext): Promise<string> {
  const id = ctx.params.id;
  renderTopbar(["Servers", id], ctx.user);

  try {
    const { live, online } = await Servers.live(id);

    const tabs = serverTabs(id, "overview");
    if (!online || !live) {
      return `${tabs}
        <div class="empty-state">
          <div class="empty-icon">📡</div>
          <div class="empty-title">Server is offline</div>
          <div class="empty-desc">The GMod server is not sending heartbeats. Check if the addon is running.</div>
        </div>`;
    }

    return `
      ${tabs}
      <div class="grid grid-4 mb-6">
        <div class="stat-card blue">
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
          <div class="stat-sub">${live.tickrate} tick</div>
        </div>
        <div class="stat-card yellow">
          <div class="stat-icon"><i data-lucide="clock"></i></div>
          <div class="stat-label">Last Update</div>
          <div class="stat-value" style="font-size:16px">${timeAgo(live.timestamp * 1000)}</div>
          <div class="stat-sub">Heartbeat</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Live Players (${live.player_count})</div>
          <a href="/servers/${id}/players" class="btn btn-ghost btn-sm">Full list →</a>
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
    { key: "overview",  label: "Overview",  href: `/servers/${id}` },
    { key: "players",   label: "Players",   href: `/servers/${id}/players` },
    { key: "events",    label: "Events",    href: `/servers/${id}/events` },
    { key: "commands",  label: "Commands",  href: `/servers/${id}/commands` },
    { key: "warnings",  label: "Warnings",  href: `/servers/${id}/warnings` },
    { key: "stats",     label: "Stats",     href: `/servers/${id}/stats` },
  ];
  return `
    <div class="tab-bar">
      ${tabs.map(t => `<a href="${t.href}" class="tab ${t.key === active ? "active" : ""}">${t.label}</a>`).join("")}
    </div>
  `;
}

function timeAgo(ms: number) {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
