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
import { serverHomeView, serverTabs } from "./views/server-home";
import { serverPlayersView, serverPlayersAfter } from "./views/server-players";
import { serverEventsView, serverEventsAfter } from "./views/server-events";
import { serverCommandsView, serverCommandsAfter } from "./views/server-commands";
import { serverWarningsView, serverWarningsAfter } from "./views/server-warnings";
import { serverStatsView, serverStatsAfter } from "./views/server-stats";
import { playerProfileView } from "./views/player-profile";
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

route("/servers/:id",          serverHomeView);
route("/servers/:id/players",  serverPlayersView, { after: serverPlayersAfter });
route("/servers/:id/events",   serverEventsView,  { after: serverEventsAfter });
route("/servers/:id/commands", serverCommandsView,{ after: serverCommandsAfter });
route("/servers/:id/warnings", serverWarningsView,{ after: serverWarningsAfter });
route("/servers/:id/stats",    serverStatsView,   { after: serverStatsAfter });

route("/players/:steamid", playerProfileView);

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
// Init
// =========================================================================

async function init() {
  // Restore sidebar and topbar visibility
  document.getElementById("sidebar")!.style.display = "";
  document.getElementById("topbar")!.style.display = "";

  try {
    currentUser = await Auth.me();
    setUser(currentUser);
  } catch {
    currentUser = null;
    setUser(null);
  }

  renderSidebar(currentUser);

  // Sync server list into sidebar
  if (currentUser) {
    import("./lib/api").then(({ Servers }) => {
      Servers.list().then(({ servers }) => setSidebarServers(servers)).catch(() => {});
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
