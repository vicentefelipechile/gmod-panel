// =========================================================================
// views/server-events.ts — Real-time event feed (WebSocket + HTTP fallback)
// =========================================================================

import { Servers } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import { serverTabs } from "./server-home";
import type { RouteContext } from "../router";

let ws: WebSocket | null = null;

function iconForType(type: string) {
  const map: Record<string, string> = {
    player_join:  "join",  player_leave: "leave",
    player_death: "death", player_chat:  "chat",
    map_change:   "map",
  };
  return map[type] ?? "default";
}

function emojiForType(type: string) {
  const map: Record<string, string> = {
    player_join: "→", player_leave: "←", player_death: "💀",
    player_chat: "💬", map_change: "🗺️",
  };
  return map[type] ?? "•";
}

function renderEvent(ev: { ts: number; type: string; data: string }) {
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(ev.data); } catch { /* ignore */ }

  const label = (() => {
    switch (ev.type) {
      case "player_join":  return `<strong>${data.name ?? "?"}</strong> joined`;
      case "player_leave": return `<strong>${data.name ?? "?"}</strong> left`;
      case "player_death": {
        const a = (data.attacker as { name?: string } | null)?.name;
        const v = (data.victim   as { name?: string } | null)?.name;
        return a ? `<strong>${a}</strong> killed <strong>${v ?? "?"}</strong> with ${data.weapon ?? "?"}` : `<strong>${v ?? "?"}</strong> died`;
      }
      case "player_chat":  return `<strong>${data.name ?? "?"}</strong>: ${data.message ?? ""}`;
      case "map_change":   return `Map changed to <strong>${data.map ?? "?"}</strong>`;
      default: return `${ev.type}`;
    }
  })();

  const cls = iconForType(ev.type);
  const time = new Date(ev.ts * 1000).toLocaleTimeString();

  return `
    <div class="event-item">
      <div class="event-icon ${cls}">${emojiForType(ev.type)}</div>
      <div class="event-body">
        <div class="event-text">${label}</div>
        <div class="event-time">${time}</div>
      </div>
    </div>
  `;
}

function prependEvent(ev: Parameters<typeof renderEvent>[0]) {
  const feed = document.getElementById("event-feed");
  if (!feed) return;
  const item = document.createElement("div");
  item.innerHTML = renderEvent(ev);
  feed.insertAdjacentHTML("afterbegin", item.innerHTML);
  // trim to 200
  while (feed.children.length > 200) feed.lastElementChild?.remove();
}

export async function serverEventsView(ctx: RouteContext): Promise<string> {
  const id = ctx.params.id;
  renderTopbar(["Servers", id, "Events"], ctx.user);
  ws?.close();

  try {
    const { events } = await Servers.events(id, 80);
    return `
      ${serverTabs(id, "events")}
      <div class="card">
        <div class="card-header">
          <div class="card-title">Event Feed</div>
          <span class="badge badge-green" id="ws-badge"><span class="badge-dot"></span> Live</span>
        </div>
        <div class="event-feed" id="event-feed">
          ${events.length === 0
            ? `<div class="empty-state" style="padding:32px"><div class="empty-desc">No events yet</div></div>`
            : events.map(renderEvent).join("")}
        </div>
      </div>
    `;
  } catch {
    return `${serverTabs(id, "events")}<div class="empty-state"><div class="empty-title">Failed to load events</div></div>`;
  }
}

export function serverEventsAfter(ctx: RouteContext) {
  const id = ctx.params.id;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/api/v1/servers/${id}/ws`);

  ws.addEventListener("message", (e) => {
    try {
      const msg = JSON.parse(e.data as string) as { type: string; event?: unknown };
      if (msg.type === "event" && msg.event) {
        prependEvent(msg.event as Parameters<typeof renderEvent>[0]);
      }
    } catch { /* ignore */ }
  });

  ws.addEventListener("close", () => {
    const badge = document.getElementById("ws-badge");
    if (badge) badge.className = "badge badge-muted";
  });

  // Cleanup when navigating away
  window.addEventListener("popstate", () => ws?.close(), { once: true });
}
