// =========================================================================
// main.ts — Entry point: auth check, sidebar, router init
// =========================================================================

import "./index.css";

import { Auth } from "./lib/api";
import { route, notFound, initRouter, navigate, setUser } from "./router";
import { renderSidebar, highlightSidebarItem, setSidebarServers } from "./components/sidebar";
import { renderTopbar } from "./components/topbar";

import { loginView, loginAfter } from "./views/login";
import { serversView } from "./views/servers";
import { serverHomeView, serverHomeAfter, serverTabs } from "./views/server-home";
import { serverPlayersView, serverPlayersAfter } from "./views/server-players";
import { serverEventsView, serverEventsAfter } from "./views/server-events";
import { serverCommandsView, serverCommandsAfter } from "./views/server-commands";
import { serverWarningsView, serverWarningsAfter } from "./views/server-warnings";
import { serverStatsView, serverStatsAfter } from "./views/server-stats";
import { serverConfigView, serverConfigAfter } from "./views/server-config";
import { serverMembersView, serverMembersAfter } from "./views/server-members";
import { playerProfileView } from "./views/player-profile";
import { setupView, setupAfter } from "./views/setup";
import type { Me, Server } from "./lib/api";

// =========================================================================
// Auth bootstrap
// =========================================================================

let currentUser: Me | null = null;

// Logout event from API wrapper
window.addEventListener("gmp:logout", () => {
  currentUser = null;
  setUser(null);
  renderSidebar(null);
  renderTopbar([], null);
  navigate("/login");
});

// =========================================================================
// Route registration
// =========================================================================

route("/login", loginView, { requireAuth: false, after: loginAfter });

route("/", async (ctx) => {
  navigate("/servers", true);
  return "";
}, { requireAuth: false });

route("/servers", serversView);

route("/servers/:id", serverHomeView, { after: serverHomeAfter });
route("/servers/:id/players", serverPlayersView, { after: serverPlayersAfter });
route("/servers/:id/events", serverEventsView, { after: serverEventsAfter });
route("/servers/:id/commands", serverCommandsView, { after: serverCommandsAfter });
route("/servers/:id/warnings", serverWarningsView, { after: serverWarningsAfter });
route("/servers/:id/stats", serverStatsView, { after: serverStatsAfter });
route("/servers/:id/config", serverConfigView, { after: serverConfigAfter });
route("/servers/:id/members", serverMembersView, { after: serverMembersAfter });

route("/players/:steamid", playerProfileView);

route("/setup", setupView, { after: setupAfter });

route("/settings", async (ctx) => {
  renderTopbar(["Settings"], ctx.user);
  return `
    <div class="page-header">
      <div class="page-title">Settings</div>
      <div class="page-desc">Account and server management</div>
    </div>
    <div class="card" style="max-width:480px">
      <div class="card-header"><div class="card-title">Account</div></div>
      <div class="flex items-center gap-3 mb-4">
        <img class="player-avatar" src="${currentUser?.avatar_url ?? ""}" style="width:48px;height:48px" />
        <div>
          <div style="font-weight:600">${currentUser?.display_name ?? ""}</div>
          <div class="text-muted font-mono text-sm">${currentUser?.steamid64 ?? ""}</div>
        </div>
      </div>
      <button class="btn btn-danger" id="logout-btn">Sign out</button>
    </div>
  `;
}, {
  after: () => {
    document.getElementById("logout-btn")?.addEventListener("click", async () => {
      await Auth.logout();
      window.dispatchEvent(new Event("gmp:logout"));
    });
  }
});

notFound(async () => {
  return `<div class="empty-state">
    <div class="empty-icon">🔍</div>
    <div class="empty-title">Page not found</div>
    <div class="empty-desc"><a href="/servers" style="color:var(--cyan)">Go back to servers</a></div>
  </div>`;
});

// =========================================================================
// Invitation banner
// =========================================================================

function showInvitationBanners(invitations: NonNullable<typeof currentUser>["pending_invitations"]) {
  if (!invitations?.length) return;

  // Inject into the main content area, above everything else
  const container = document.getElementById("app") ?? document.body;
  const wrapper = document.createElement("div");
  wrapper.id = "invite-banners";
  wrapper.style.cssText = "position:fixed;top:56px;right:16px;z-index:900;display:flex;flex-direction:column;gap:8px;max-width:360px";

  invitations.forEach((inv: any) => {
    const serverLabel = inv.display_name || inv.name || inv.server_id;
    const inviterLabel = inv.inviter_name || inv.invited_by;
    const card = document.createElement("div");
    card.className = "invite-banner";
    card.dataset.server = inv.server_id;
    card.innerHTML = `
      <div class="invite-banner-icon"><i data-lucide="user-plus" style="width:20px;height:20px"></i></div>
      <div class="invite-banner-body">
        <div class="invite-banner-title">You've been invited!</div>
        <div class="invite-banner-desc">
          <strong>${inviterLabel}</strong> invited you to manage <strong>${serverLabel}</strong>.
        </div>
        <div class="invite-banner-actions">
          <button class="btn btn-primary btn-sm invite-accept" data-server="${inv.server_id}">Accept</button>
          <button class="btn btn-ghost btn-sm invite-decline" data-server="${inv.server_id}">Decline</button>
        </div>
      </div>
      <button class="invite-dismiss" data-server="${inv.server_id}" title="Dismiss">✕</button>
    `;
    wrapper.appendChild(card);
  });

  document.body.appendChild(wrapper);
  import("./lib/icons").then(({ refreshIcons }) => refreshIcons());

  // Wire buttons (event delegation on wrapper)
  wrapper.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest("[data-server]") as HTMLElement | null;
    if (!btn) return;
    const server_id = btn.dataset.server!;
    const card = wrapper.querySelector(`[data-server="${server_id}"].invite-banner`) as HTMLElement | null;

    if (btn.classList.contains("invite-accept")) {
      btn.textContent = "Accepting…";
      (btn as HTMLButtonElement).disabled = true;
      import("./lib/api").then(async ({ Servers }) => {
        try {
          await Servers.respondInvitation(server_id, "accept");
          card?.remove();
          import("./components/toast").then(({ toast }) => toast("Invitation accepted!", "success"));
          // Reload server list in sidebar
          Servers.list().then(({ servers }) => {
            import("./components/sidebar").then(({ setSidebarServers }) => setSidebarServers(servers));
          }).catch(() => {});
        } catch (err: any) {
          import("./components/toast").then(({ toast }) => toast(`Failed: ${err.message}`, "error"));
          btn.textContent = "Accept";
          (btn as HTMLButtonElement).disabled = false;
        }
      });
    } else if (btn.classList.contains("invite-decline")) {
      btn.textContent = "Declining…";
      (btn as HTMLButtonElement).disabled = true;
      import("./lib/api").then(async ({ Servers }) => {
        try {
          await Servers.respondInvitation(server_id, "decline");
          card?.remove();
        } catch {
          btn.textContent = "Decline";
          (btn as HTMLButtonElement).disabled = false;
        }
      });
    } else if (btn.classList.contains("invite-dismiss")) {
      card?.remove();
    }

    // Remove the whole wrapper when no cards remain
    if (wrapper.querySelectorAll(".invite-banner").length === 0) wrapper.remove();
  });
}

// =========================================================================
// Init
// =========================================================================

async function init() {
  // Restore sidebar and topbar visibility
  document.getElementById("sidebar")!.style.display = "";
  document.getElementById("topbar")!.style.display = "";

  try {
    currentUser = await Auth.me();
    setUser(currentUser);

    // Show pending invitation banners
    if (currentUser?.pending_invitations?.length) {
      showInvitationBanners(currentUser.pending_invitations);
    }
  } catch {
    currentUser = null;
    setUser(null);
  }

  renderSidebar(currentUser);

  // Sync server list into sidebar
  if (currentUser) {
    import("./lib/api").then(({ Servers }) => {
      Servers.list().then(({ servers }) => setSidebarServers(servers)).catch(() => { });
    });
  }

  // Highlight sidebar on each navigation
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    originalPushState(...args);
    highlightSidebarItem(location.pathname);
  };
  window.addEventListener("popstate", () => highlightSidebarItem(location.pathname));

  initRouter();
  highlightSidebarItem(location.pathname);
}

init();
