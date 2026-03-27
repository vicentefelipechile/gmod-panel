// =========================================================================
// views/server-members.ts — Server team management (invite, list, remove)
// =========================================================================

import { Servers } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import { serverTabs } from "./server-home";
import { toast } from "../components/toast";
import { refreshIcons } from "../lib/icons";
import type { RouteContext } from "../router";

// =========================================================================
// Helpers
// =========================================================================

function statusBadge(status: string) {
  if (status === "accepted") return `<span class="badge badge-green">Member</span>`;
  if (status === "pending")  return `<span class="badge badge-yellow">Pending…</span>`;
  if (status === "declined") return `<span class="badge badge-red">Declined</span>`;
  return `<span class="badge badge-muted">${status}</span>`;
}

function memberRow(m: any, isOwner: boolean, serverId: string): string {
  const avatar = m.avatar_url
    ? `<img src="${m.avatar_url}" class="player-avatar" style="width:32px;height:32px;border-radius:50%;margin-right:10px">`
    : `<div class="player-avatar-placeholder" style="width:32px;height:32px;border-radius:50%;background:var(--surface-2);margin-right:10px;display:inline-flex;align-items:center;justify-content:center"><i data-lucide="user" style="width:16px;height:16px"></i></div>`;
  return `
    <tr>
      <td><div style="display:flex;align-items:center">${avatar}<span>${m.display_name ?? m.steamid64}</span></div></td>
      <td class="mono text-sm text-muted">${m.steamid64}</td>
      <td>${statusBadge(m.status)}</td>
      <td class="text-sm text-muted">${m.invited_by ?? "—"}</td>
      <td class="text-sm text-muted">${new Date(m.created_at).toLocaleDateString()}</td>
      <td>${isOwner ? `
        <button class="btn btn-ghost btn-sm btn-danger member-remove-btn"
          data-steamid="${m.steamid64}"
          title="Remove / revoke invitation">
          <i data-lucide="user-minus" style="width:14px;height:14px"></i>
        </button>` : ""}</td>
    </tr>`;
}

// =========================================================================
// View
// =========================================================================

export async function serverMembersView(ctx: RouteContext): Promise<string> {
  const id = ctx.params.id;
  renderTopbar(["Servers", id, "Members"], ctx.user);

  let owner: any = null;
  let members: any[] = [];
  let isOwner = false;

  try {
    const res = await Servers.members(id);
    owner = res.owner;
    members = res.members;
    isOwner = owner?.steamid64 === ctx.user?.steamid64;
  } catch {
    return `${serverTabs(id, "members")}
      <div class="empty-state"><div class="empty-title">Failed to load members</div></div>`;
  }

  const ownerRow = owner ? `
    <tr>
      <td>
        <div style="display:flex;align-items:center">
          ${owner.avatar_url
            ? `<img src="${owner.avatar_url}" class="player-avatar" style="width:32px;height:32px;border-radius:50%;margin-right:10px">`
            : `<div style="width:32px;height:32px;border-radius:50%;background:var(--surface-2);margin-right:10px;display:inline-flex;align-items:center;justify-content:center"><i data-lucide="user" style="width:16px;height:16px"></i></div>`}
          <span>${owner.display_name ?? owner.steamid64}</span>
        </div>
      </td>
      <td class="mono text-sm text-muted">${owner.steamid64}</td>
      <td><span class="badge badge-cyan">Owner</span></td>
      <td class="text-muted">—</td>
      <td class="text-muted">—</td>
      <td></td>
    </tr>` : "";

  return `
    ${serverTabs(id, "members")}
    <div style="display:grid;grid-template-columns:1fr 340px;gap:16px;align-items:start">

      <!-- Member table -->
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="users" style="width:14px;height:14px;margin-right:6px;margin-bottom:-2px"></i>Team (${members.length + 1})</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Player</th><th>SteamID64</th><th>Status</th><th>Invited By</th><th>Date</th><th></th>
              </tr>
            </thead>
            <tbody>
              ${ownerRow}
              ${members.length === 0
                ? `<tr><td colspan="6" class="text-muted" style="text-align:center;padding:24px">No members yet. Invite someone below.</td></tr>`
                : members.map(m => memberRow(m, isOwner, id)).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Invite panel (owner only) -->
      <div class="card" style="align-self:start">
        <div class="card-header">
          <div class="card-title"><i data-lucide="user-plus" style="width:14px;height:14px;margin-right:6px;margin-bottom:-2px"></i>Invite Member</div>
        </div>
        ${isOwner ? `
          <div style="padding-bottom:4px">
            <div class="form-group">
              <label class="form-label" for="invite-input">SteamID64 or Steam Profile URL</label>
              <input class="form-input" type="text" id="invite-input"
                placeholder="76561198... or steamcommunity.com/id/..." />
              <div class="hint text-muted text-sm" style="margin-top:6px">
                <i data-lucide="info" style="width:13px;height:13px;margin-bottom:-2px"></i>
                Accepts SteamID64, /profiles/ URL, or /id/ vanity URL.
              </div>
            </div>
            <button class="btn btn-primary w-full" id="invite-btn">
              <i data-lucide="user-plus" style="width:14px;height:14px"></i> Send Invitation
            </button>
          </div>
        ` : `
          <div class="empty-state" style="padding:20px">
            <div class="empty-desc">Only the server owner can invite members.</div>
          </div>
        `}
      </div>
    </div>
  `;
}

// =========================================================================
// After hook
// =========================================================================

export function serverMembersAfter(ctx: RouteContext) {
  const id = ctx.params.id;

  // Invite button
  const btn = document.getElementById("invite-btn") as HTMLButtonElement | null;
  btn?.addEventListener("click", async () => {
    const input = (document.getElementById("invite-input") as HTMLInputElement).value.trim();
    if (!input) { toast("Enter a SteamID64 or Steam URL", "info"); return; }
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" style="width:14px;height:14px"></i> Sending…`;
    refreshIcons();
    try {
      const res = await Servers.invite(id, input);
      toast(`Invitation sent to ${res.display_name}`, "success");
      (document.getElementById("invite-input") as HTMLInputElement).value = "";
      // Reload the page to show updated list
      setTimeout(() => location.reload(), 800);
    } catch (err: any) {
      toast(`Failed: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
      refreshIcons();
    }
  });

  // Remove buttons
  document.querySelectorAll<HTMLButtonElement>(".member-remove-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const steamid = btn.dataset.steamid!;
      if (!confirm(`Remove this member (${steamid})?`)) return;
      const orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" style="width:14px;height:14px"></i>`;
      refreshIcons();
      try {
        await Servers.removeMember(id, steamid);
        toast("Member removed", "success");
        btn.closest("tr")?.remove();
      } catch (err: any) {
        toast(`Failed: ${err.message}`, "error");
        btn.disabled = false;
        btn.innerHTML = orig;
        refreshIcons();
      }
    });
  });
}
