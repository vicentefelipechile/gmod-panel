// =========================================================================
// views/server-commands.ts — Command queue and registry-driven smart form
// =========================================================================

import { Servers } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import { serverTabs } from "./server-home";
import { toast } from "../components/toast";
import { renderArgField, gatherArgValues } from "../lib/arg-renderer";
import { refreshIcons } from "../lib/icons";
import type { CommandRegistryEntry, LiveState } from "../lib/api";
import type { RouteContext } from "../router";

// =========================================================================
// Status badge
// =========================================================================

function statusBadge(status: string) {
  if (status === "acked")   return `<span class="badge badge-green">✓ Executed</span>`;
  if (status === "pending") return `<span class="badge badge-yellow">⏳ Pending</span>`;
  if (status === "failed")  return `<span class="badge badge-red">✗ Failed</span>`;
  return `<span class="badge badge-muted">${status}</span>`;
}

// =========================================================================
// Render the dynamic argument form for a given command entry
// =========================================================================

function renderCmdForm(entry: CommandRegistryEntry | null, live: LiveState | null): string {
  if (!entry) {
    return `<div class="empty-state" style="padding:32px">
      <div class="empty-desc">Select a command above to see its options.</div>
    </div>`;
  }

  if (entry.args.length === 0) {
    return `<div class="text-muted text-sm" style="padding:8px 0 16px">
      This command has no arguments.
    </div>`;
  }

  return entry.args.map(arg => renderArgField(arg, live)).join("");
}

// =========================================================================
// View
// =========================================================================

export async function serverCommandsView(ctx: RouteContext): Promise<string> {
  const id = ctx.params.id;
  renderTopbar(["Servers", id, "Commands"], ctx.user);

  let commands;
  let registry: CommandRegistryEntry[] = [];
  let live: LiveState | null = null;

  try {
    [{ commands }, { registry }, { live }] = await Promise.all([
      Servers.commands(id),
      Servers.registry(id).catch(() => ({ registry: [] as CommandRegistryEntry[] })),
      Servers.live(id).then(r => ({ live: r.live })).catch(() => ({ live: null })),
    ]);
  } catch {
    return `${serverTabs(id, "commands")}<div class="empty-state"><div class="empty-title">Failed to load commands</div></div>`;
  }

  // Registry empty state hint
  const registryEmpty = registry.length === 0;
  const firstEntry = registry[0] ?? null;

  const commandOptions = registry.map(e =>
    `<option value="${e.type}">${e.description || e.type}</option>`
  ).join("");

  return `
    ${serverTabs(id, "commands")}
    <div style="display:grid;grid-template-columns:1fr 380px;gap:16px">

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="list" style="width:14px;height:14px;margin-right:6px;margin-bottom:-2px"></i>Command Log</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th><th>Details</th><th>Issued By</th><th>Status</th><th>Time</th>
              </tr>
            </thead>
            <tbody>
              ${commands.length === 0
                ? `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:32px">No commands yet</td></tr>`
                : commands.map(c => {
                    // Parse payload to show human-readable key:value pairs
                    let details = "—";
                    try {
                      const p = JSON.parse(c.payload ?? "{}");
                      const pairs = Object.entries(p)
                        .filter(([, v]) => v !== null && v !== undefined && v !== "")
                        .map(([k, v]) => `<span class="cmd-detail-key">${k}</span> <span class="cmd-detail-val">${v}</span>`);
                      if (pairs.length) details = pairs.join(" · ");
                    } catch { details = c.payload ?? "—"; }

                    // Issued by: prefer display name, fall back to truncated SteamID
                    const isBy = (c as any).issued_by_name
                      ? `<span title="${c.issued_by}">${(c as any).issued_by_name}</span>`
                      : `<span class="mono text-sm text-muted">${c.issued_by ?? "—"}</span>`;

                    return `
                      <tr>
                        <td><span class="badge badge-cyan">${c.type}</span></td>
                        <td class="text-sm" style="max-width:220px;line-height:1.6">${details}</td>
                        <td class="text-sm">${isBy}</td>
                        <td>${statusBadge(c.status)}</td>
                        <td class="text-muted text-sm" style="white-space:nowrap">${new Date(c.created_at).toLocaleString()}</td>
                      </tr>
                    `;
                  }).join("")
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Send Command panel -->
      <div class="card cmd-form-card" style="align-self:start">
        <div class="card-header">
          <div class="card-title"><i data-lucide="send" style="width:14px;height:14px;margin-right:6px;margin-bottom:-2px"></i>Send Command</div>
        </div>

        ${registryEmpty ? `
          <div class="empty-state" style="padding:24px 16px">
            <div class="empty-icon"><i data-lucide="inbox" style="width:32px;height:32px"></i></div>
            <div class="empty-title" style="font-size:13px">No commands registered</div>
            <div class="empty-desc">The GMod server hasn't sent its command registry yet. Make sure the addon is running and has sent at least one heartbeat.</div>
          </div>
        ` : `
          <form id="cmd-form" style="display:flex;flex-direction:column;gap:14px;padding-top:4px">

            <div class="form-group">
              <label class="form-label" for="cmd-type">Command</label>
              <select class="form-select" id="cmd-type">
                ${commandOptions}
              </select>
              <div class="text-muted text-sm" id="cmd-description">${firstEntry?.description ?? ""}</div>
            </div>

            <div id="cmd-args">
              ${renderCmdForm(firstEntry, live)}
            </div>

            <button type="submit" class="btn btn-primary w-full" id="cmd-send-btn">
              <i data-lucide="send" style="width:14px;height:14px"></i> Send Command
            </button>
          </form>
        `}
      </div>

    </div>
  `;
}

// =========================================================================
// After hook — wire up dynamic registry form
// =========================================================================

export function serverCommandsAfter(ctx: RouteContext) {
  const id = ctx.params.id;

  // Stash registry and live state in closure for re-renders
  let registry: CommandRegistryEntry[] = [];
  let live: LiveState | null = null;

  // Fetch both in background (view already rendered from earlier fetch)
  Promise.all([
    Servers.registry(id).catch(() => ({ registry: [] as CommandRegistryEntry[] })),
    Servers.live(id).then(r => ({ live: r.live })).catch(() => ({ live: null })),
  ]).then(([regRes, liveRes]) => {
    registry = regRes.registry;
    live = liveRes.live;
  });

  // -----------------------------------------------------------------------
  // Command type selector → re-render arg fields
  // -----------------------------------------------------------------------
  const select = document.getElementById("cmd-type") as HTMLSelectElement | null;
  const argsEl = document.getElementById("cmd-args");
  const descEl = document.getElementById("cmd-description");

  select?.addEventListener("change", () => {
    const entry = registry.find(e => e.type === select.value) ?? null;
    if (argsEl) {
      argsEl.innerHTML = renderCmdForm(entry, live);
      refreshIcons();
    }
    if (descEl && entry) {
      descEl.textContent = entry.description;
    }
  });

  // -----------------------------------------------------------------------
  // Form submit
  // -----------------------------------------------------------------------
  const form = document.getElementById("cmd-form") as HTMLFormElement | null;
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const type = (document.getElementById("cmd-type") as HTMLSelectElement).value;
    if (!type) { toast("Select a command first", "info"); return; }

    const entry = registry.find(r => r.type === type);
    const args  = entry?.args ?? [];

    const payload = gatherArgValues(args);
    if (payload === null) {
      toast("Please fill in all required fields", "error");
      return;
    }

    const btn = document.getElementById("cmd-send-btn") as HTMLButtonElement;
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader" style="width:14px;height:14px"></i> Sending…`;
    refreshIcons();

    try {
      const { cmd_id } = await Servers.sendCommand(id, type, payload);
      toast(`Command queued: ${cmd_id}`, "success");
    } catch (err: any) {
      toast(`Failed: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
      refreshIcons();
    }
  });
}
