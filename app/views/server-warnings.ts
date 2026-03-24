// =========================================================================
// views/server-warnings.ts — Warning list and issue warning form
// =========================================================================

import { Servers } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import { serverTabs } from "./server-home";
import { toast } from "../components/toast";
import type { RouteContext } from "../router";

export async function serverWarningsView(ctx: RouteContext): Promise<string> {
  const id = ctx.params.id;
  renderTopbar(["Servers", id, "Warnings"], ctx.user);

  let warnings;
  try {
    ({ warnings } = await Servers.warnings(id));
  } catch {
    return `${serverTabs(id, "warnings")}<div class="empty-state"><div class="empty-title">Failed to load warnings</div></div>`;
  }

  return `
    ${serverTabs(id, "warnings")}
    <div style="display:grid;grid-template-columns:1fr 340px;gap:16px">

      <div class="card">
        <div class="card-header">
          <div class="card-title">Warnings</div>
          <span class="badge badge-yellow">${warnings.filter(w => w.active).length} active</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Player</th><th>Reason</th><th>Issued By</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              ${warnings.length === 0
                ? `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:32px">No warnings on record</td></tr>`
                : warnings.map(w => `
                  <tr>
                    <td><a href="/players/${w.steamid}" class="mono text-sm" style="color:var(--cyan)">${w.steamid}</a></td>
                    <td>${w.reason}</td>
                    <td class="mono text-sm text-muted">${w.issued_by}</td>
                    <td>${w.active
                      ? `<span class="badge badge-yellow">Active</span>`
                      : `<span class="badge badge-muted">Expired</span>`}</td>
                    <td class="text-muted text-sm">${new Date(w.created_at).toLocaleDateString()}</td>
                  </tr>
                `).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="align-self:start">
        <div class="card-header"><div class="card-title">Issue Warning</div></div>
        <form id="warn-form" style="display:flex;flex-direction:column;gap:12px">
          <div class="form-group">
            <label class="form-label">Steam ID 64</label>
            <input class="form-input" id="warn-steamid" placeholder="76561198..." />
          </div>
          <div class="form-group">
            <label class="form-label">Reason</label>
            <textarea class="form-textarea" id="warn-reason" rows="3" placeholder="Reason for warning..."></textarea>
          </div>
          <button type="submit" class="btn btn-danger w-full">⚠️ Issue Warning</button>
        </form>
      </div>

    </div>
  `;
}

export function serverWarningsAfter(ctx: RouteContext) {
  const id = ctx.params.id;
  const form = document.getElementById("warn-form") as HTMLFormElement;

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const steamid = (document.getElementById("warn-steamid") as HTMLInputElement).value.trim();
    const reason = (document.getElementById("warn-reason") as HTMLTextAreaElement).value.trim();

    if (!steamid || !reason) { toast("SteamID and reason are required", "error"); return; }

    try {
      await Servers.issueWarning(id, steamid, reason);
      toast("Warning issued", "success");
      (document.getElementById("warn-steamid") as HTMLInputElement).value = "";
      (document.getElementById("warn-reason") as HTMLTextAreaElement).value = "";
    } catch (err) {
      toast(`Failed: ${err}`, "error");
    }
  });
}
