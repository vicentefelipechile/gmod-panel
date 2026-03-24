// =========================================================================
// views/player-profile.ts — Player profile: sessions, kills, warnings
// =========================================================================

import { Players } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import type { RouteContext } from "../router";

function fmtSeconds(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export async function playerProfileView(ctx: RouteContext): Promise<string> {
  const steamid = ctx.params.steamid;
  renderTopbar(["Players", steamid], ctx.user);

  try {
    const [profile, { warnings }] = await Promise.all([
      Players.profile(steamid),
      Players.warnings(steamid),
    ]);

    const kd = profile.deaths > 0 ? (profile.kills / profile.deaths).toFixed(2) : profile.kills.toString();

    return `
      <div class="page-header">
        <div style="display:flex;align-items:center;gap:16px">
          <div class="player-avatar" style="width:64px;height:64px;border-radius:12px"></div>
          <div>
            <div class="page-title">${steamid}</div>
            <div class="page-desc font-mono">${steamid}</div>
          </div>
        </div>
      </div>

      <div class="grid grid-4 mb-6">
        <div class="stat-card cyan">
          <div class="stat-label">Playtime</div>
          <div class="stat-value" style="font-size:20px">${fmtSeconds(profile.total_playtime_seconds)}</div>
        </div>
        <div class="stat-card green">
          <div class="stat-label">Kills</div>
          <div class="stat-value">${profile.kills}</div>
        </div>
        <div class="stat-card red">
          <div class="stat-label">Deaths</div>
          <div class="stat-value">${profile.deaths}</div>
        </div>
        <div class="stat-card purple">
          <div class="stat-label">K/D</div>
          <div class="stat-value" style="font-size:20px">${kd}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card">
          <div class="card-header"><div class="card-title">Recent Sessions (${profile.sessions.length})</div></div>
          <div class="table-wrap" style="border:none">
            <table>
              <thead><tr><th>Server</th><th>Map</th><th>Duration</th></tr></thead>
              <tbody>
                ${(profile.sessions as Array<{ server_id: string; map: string | null; joined_at: number; left_at: number | null }>).map(s => `
                  <tr>
                    <td class="mono text-sm">${s.server_id}</td>
                    <td class="text-muted">${s.map ?? "—"}</td>
                    <td class="text-sm">${s.left_at ? fmtSeconds((s.left_at - s.joined_at) / 1000) : "Active"}</td>
                  </tr>
                `).join("") || `<tr><td colspan="3" class="text-muted" style="text-align:center;padding:20px">No sessions</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">Warnings (${warnings.length})</div>
            <span class="badge badge-yellow">${warnings.filter(w => w.active).length} active</span>
          </div>
          ${warnings.length === 0
            ? `<div class="empty-state" style="padding:24px"><div class="empty-desc">No warnings on record</div></div>`
            : warnings.map(w => `
              <div style="padding:10px 0;border-bottom:1px solid var(--border)">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <span class="text-sm">${w.reason}</span>
                  ${w.active ? `<span class="badge badge-yellow">Active</span>` : `<span class="badge badge-muted">Expired</span>`}
                </div>
                <div class="text-muted text-sm mt-2">${new Date(w.created_at).toLocaleDateString()}</div>
              </div>
            `).join("")
          }
        </div>
      </div>
    `;
  } catch {
    return `<div class="empty-state"><div class="empty-title">Player not found</div></div>`;
  }
}
