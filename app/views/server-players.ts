// =========================================================================
// views/server-players.ts — Live player list with action buttons
// =========================================================================

import { Servers } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import { serverTabs } from "./server-home";
import { toast } from "../components/toast";
import type { RouteContext } from "../router";

export async function serverPlayersView(ctx: RouteContext): Promise<string> {
  const id = ctx.params.id;
  renderTopbar(["Servers", id, "Players"], ctx.user);

  try {
    const { players, online } = await Servers.players(id);

    return `
      ${serverTabs(id, "players")}
      <div class="card">
        <div class="card-header">
          <div class="card-title">Players ${online ? `<span class="badge badge-green ml-2">${players.length} online</span>` : `<span class="badge badge-muted">Offline</span>`}</div>
        </div>
        ${players.length === 0
          ? `<div class="empty-state" style="padding:32px">
               <div class="empty-icon">👥</div>
               <div class="empty-title">${online ? "No players online" : "Server offline"}</div>
             </div>`
          : `<div class="event-feed">
              ${players.map(p => `
                <div class="player-card">
                  <div class="player-avatar"></div>
                  <div style="flex:1">
                    <div class="player-name">${p.name}</div>
                    <div class="player-info">${p.steamid} · ${p.ping}ms · ${Math.floor(p.playtime / 60)}m online</div>
                  </div>
                  <div class="player-actions" style="opacity:1">
                    <a href="/players/${p.steamid}" class="btn btn-sm btn-ghost">Profile</a>
                    <button class="btn btn-sm btn-secondary" data-action="warn" data-steamid="${p.steamid}" data-name="${p.name}">Warn</button>
                    <button class="btn btn-sm btn-danger" data-action="kick" data-steamid="${p.steamid}" data-name="${p.name}">Kick</button>
                  </div>
                </div>
              `).join("")}
            </div>`
        }
      </div>
    `;
  } catch {
    return `${serverTabs(id, "players")}<div class="empty-state"><div class="empty-title">Failed to load players</div></div>`;
  }
}

export function serverPlayersAfter(ctx: RouteContext) {
  const id = ctx.params.id;

  document.querySelectorAll("[data-action='kick']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const steamid = (btn as HTMLElement).dataset.steamid!;
      const name = (btn as HTMLElement).dataset.name!;
      if (!confirm(`Kick ${name}?`)) return;
      try {
        await Servers.sendCommand(id, "kick", { steamid });
        toast(`Kicked ${name}`, "success");
      } catch (e) {
        toast(`Failed: ${e}`, "error");
      }
    });
  });

  document.querySelectorAll("[data-action='warn']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const steamid = (btn as HTMLElement).dataset.steamid!;
      const name = (btn as HTMLElement).dataset.name!;
      const reason = prompt(`Warning reason for ${name}:`);
      if (!reason) return;
      try {
        await Servers.issueWarning(id, steamid, reason);
        toast(`Warning issued to ${name}`, "success");
      } catch (e) {
        toast(`Failed: ${e}`, "error");
      }
    });
  });
}
