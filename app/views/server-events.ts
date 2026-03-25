// =========================================================================
// views/server-events.ts — Real-time event feed (WebSocket + HTTP fallback)
// =========================================================================

import { Servers } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import { serverTabs } from "./server-home";
import { getEventDef } from "../lib/events";
import type { RouteContext } from "../router";

let ws: WebSocket | null = null;

function renderEvent(ev: { ts: number; type: string; data: string }) {
  let data: Record<string, any> = {};
  try { data = JSON.parse(ev.data); } catch { /* ignore */ }

  const def = getEventDef(ev.type);
  const label = def.format(data);
  const cls = def.icon;
  const time = new Date(ev.ts * 1000).toLocaleTimeString();

  return `
    <div class="event-item">
      <div class="event-icon ${cls}">${def.emoji}</div>
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
