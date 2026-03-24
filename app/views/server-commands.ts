// =========================================================================
// views/server-commands.ts — Command queue and manual command form
// =========================================================================

import { Servers } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import { serverTabs } from "./server-home";
import { toast } from "../components/toast";
import type { RouteContext } from "../router";

const COMMAND_TYPES = [
  { value: "kick",       label: "Kick player" },
  { value: "ban",        label: "Ban player" },
  { value: "unban",      label: "Unban player" },
  { value: "warn",       label: "Warn player" },
  { value: "mute",       label: "Mute player" },
  { value: "message",    label: "Broadcast message" },
  { value: "goto",       label: "Teleport to player" },
  { value: "spectate",   label: "Force spectate" },
  { value: "map_change", label: "Change map" },
  { value: "rcon",       label: "Console command" },
];

function statusBadge(status: string) {
  if (status === "acked")   return `<span class="badge badge-green">✓ Executed</span>`;
  if (status === "pending") return `<span class="badge badge-yellow">⏳ Pending</span>`;
  if (status === "failed")  return `<span class="badge badge-red">✗ Failed</span>`;
  return `<span class="badge badge-muted">${status}</span>`;
}

export async function serverCommandsView(ctx: RouteContext): Promise<string> {
  const id = ctx.params.id;
  renderTopbar(["Servers", id, "Commands"], ctx.user);

  let commands;
  try {
    ({ commands } = await Servers.commands(id));
  } catch {
    return `${serverTabs(id, "commands")}<div class="empty-state"><div class="empty-title">Failed to load commands</div></div>`;
  }

  return `
    ${serverTabs(id, "commands")}
    <div style="display:grid;grid-template-columns:1fr 360px;gap:16px">

      <div class="card">
        <div class="card-header"><div class="card-title">Command Log</div></div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th><th>Payload</th><th>Issued By</th><th>Status</th><th>Time</th>
              </tr>
            </thead>
            <tbody>
              ${commands.length === 0
                ? `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:32px">No commands yet</td></tr>`
                : commands.map(c => `
                  <tr>
                    <td><span class="badge badge-cyan">${c.type}</span></td>
                    <td class="mono truncate" style="max-width:200px">${c.payload}</td>
                    <td class="mono text-sm">${c.issued_by}</td>
                    <td>${statusBadge(c.status)}</td>
                    <td class="text-muted text-sm">${new Date(c.created_at).toLocaleString()}</td>
                  </tr>
                `).join("")
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="align-self:start">
        <div class="card-header"><div class="card-title">Send Command</div></div>
        <form id="cmd-form" style="display:flex;flex-direction:column;gap:12px">
          <div class="form-group">
            <label class="form-label">Command type</label>
            <select class="form-select" id="cmd-type">
              ${COMMAND_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join("")}
            </select>
          </div>
          <div class="form-group" id="cmd-payload-group">
            <label class="form-label">Payload (JSON)</label>
            <textarea class="form-textarea" id="cmd-payload" rows="4" placeholder='{"steamid":"76561198..."}'></textarea>
          </div>
          <button type="submit" class="btn btn-primary w-full">Send Command</button>
        </form>
      </div>

    </div>
  `;
}

export function serverCommandsAfter(ctx: RouteContext) {
  const id = ctx.params.id;
  const form = document.getElementById("cmd-form") as HTMLFormElement;

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = (document.getElementById("cmd-type") as HTMLSelectElement).value;
    const payloadStr = (document.getElementById("cmd-payload") as HTMLTextAreaElement).value || "{}";
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(payloadStr); } catch {
      toast("Invalid JSON payload", "error"); return;
    }
    try {
      const { cmd_id } = await Servers.sendCommand(id, type, payload);
      toast(`Command queued: ${cmd_id}`, "success");
    } catch (err) {
      toast(`Failed: ${err}`, "error");
    }
  });
}
