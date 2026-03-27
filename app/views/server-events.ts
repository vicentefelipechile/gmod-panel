// =========================================================================
// views/server-events.ts — Event feed with type filter and pagination
// =========================================================================

import { Servers } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import { serverTabs } from "./server-home";
import { getEventDef } from "../lib/events";
import { refreshIcons } from "../lib/icons";
import type { RouteContext } from "../router";

let ws: WebSocket | null = null;

// =========================================================================
// Render single event row
// =========================================================================

function renderEvent(ev: { ts: number; type: string; data: string }) {
  let data: Record<string, any> = {};
  try { data = JSON.parse(ev.data); } catch { /* ignore */ }

  const def = getEventDef(ev.type);
  const label = def.format(data);
  const time = new Date(ev.ts * 1000).toLocaleString();

  return `
    <div class="event-item">
      <div class="event-icon ${def.icon}">${def.emoji}</div>
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
  const tmp = document.createElement("div");
  tmp.innerHTML = renderEvent(ev);
  feed.insertAdjacentElement("afterbegin", tmp.firstElementChild!);
  while (feed.children.length > 200) feed.lastElementChild?.remove();
}

// =========================================================================
// View
// =========================================================================

export async function serverEventsView(ctx: RouteContext): Promise<string> {
  const id = ctx.params.id;
  renderTopbar(["Servers", id, "Events"], ctx.user);
  ws?.close();

  try {
    const { events, types, has_more } = await Servers.events(id, 50);

    const typeOptions = ["", ...types]
      .map(t => `<option value="${t}">${t === "" ? "All types" : t}</option>`)
      .join("");

    return `
      ${serverTabs(id, "events")}
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:8px">
          <div class="card-title">
            <i data-lucide="terminal" style="width:14px;height:14px;margin-right:6px;margin-bottom:-2px"></i>Event Feed
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
            <select class="form-select" id="event-type-filter" style="padding:4px 8px;font-size:12px;width:auto">
              ${typeOptions}
            </select>
            <span class="badge badge-green" id="ws-badge"><span class="badge-dot"></span> Live</span>
          </div>
        </div>

        <div class="event-feed" id="event-feed">
          ${events.length === 0
            ? `<div class="empty-state" style="padding:32px"><div class="empty-desc">No events yet</div></div>`
            : events.map(renderEvent).join("")}
        </div>

        ${has_more ? `
          <div style="padding:12px;text-align:center;border-top:1px solid var(--border)">
            <button class="btn btn-ghost btn-sm" id="load-more-btn"
              data-server="${id}" data-cursor="${events.at(-1)?.ts ?? 0}" data-type="">
              <i data-lucide="chevron-down" style="width:14px;height:14px"></i> Load more
            </button>
          </div>` : ""}
      </div>
    `;
  } catch {
    return `${serverTabs(id, "events")}<div class="empty-state"><div class="empty-title">Failed to load events</div></div>`;
  }
}

// =========================================================================
// After hook
// =========================================================================

export function serverEventsAfter(ctx: RouteContext) {
  const id = ctx.params.id;

  // -----------------------------------------------------------------------
  // Type filter
  // -----------------------------------------------------------------------
  const filterEl = document.getElementById("event-type-filter") as HTMLSelectElement | null;
  filterEl?.addEventListener("change", async () => {
    const type = filterEl.value || undefined;
    const feed = document.getElementById("event-feed")!;
    feed.innerHTML = `<div class="empty-state" style="padding:20px"><div class="empty-desc">Loading…</div></div>`;

    try {
      const { events, has_more } = await Servers.events(id, 50, undefined, type);
      feed.innerHTML = events.length === 0
        ? `<div class="empty-state" style="padding:32px"><div class="empty-desc">No events of this type</div></div>`
        : events.map(renderEvent).join("");

      // Update load-more cursor
      const lmBtn = document.getElementById("load-more-btn") as HTMLButtonElement | null;
      if (lmBtn) {
        lmBtn.dataset.cursor = String(events.at(-1)?.ts ?? 0);
        lmBtn.dataset.type = type ?? "";
        lmBtn.closest("div")!.style.display = has_more ? "" : "none";
      }
    } catch {
      feed.innerHTML = `<div class="empty-state" style="padding:20px"><div class="empty-desc">Failed to load events</div></div>`;
    }
  });

  // -----------------------------------------------------------------------
  // Load more (cursor pagination)
  // -----------------------------------------------------------------------
  document.getElementById("load-more-btn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const cursor = parseInt(btn.dataset.cursor ?? "0");
    const type = btn.dataset.type || undefined;
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" style="width:14px;height:14px"></i> Loading…`;
    refreshIcons();

    try {
      const { events, has_more } = await Servers.events(id, 50, cursor, type);
      const feed = document.getElementById("event-feed")!;
      events.forEach(ev => {
        const tmp = document.createElement("div");
        tmp.innerHTML = renderEvent(ev);
        feed.appendChild(tmp.firstElementChild!);
      });
      btn.dataset.cursor = String(events.at(-1)?.ts ?? cursor);
      if (!has_more) btn.closest("div")!.style.display = "none";
    } catch {
      // ignore
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
      refreshIcons();
    }
  });

  // -----------------------------------------------------------------------
  // WebSocket for live events
  // -----------------------------------------------------------------------
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/api/v1/servers/${id}/ws`);

  ws.addEventListener("message", (e) => {
    try {
      const msg = JSON.parse(e.data as string) as { type: string; event?: unknown };
      if (msg.type === "event" && msg.event) {
        const activeFilter = (document.getElementById("event-type-filter") as HTMLSelectElement)?.value;
        const ev = msg.event as Parameters<typeof renderEvent>[0];
        if (!activeFilter || activeFilter === ev.type) {
          prependEvent(ev);
        }
      }
    } catch { /* ignore */ }
  });

  ws.addEventListener("close", () => {
    const badge = document.getElementById("ws-badge");
    if (badge) badge.className = "badge badge-muted";
  });

  window.addEventListener("popstate", () => ws?.close(), { once: true });
}
