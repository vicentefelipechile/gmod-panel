// =========================================================================
// components/topbar.ts — Top bar: breadcrumb + user avatar
// =========================================================================

import { Auth } from "../lib/api";
import { toast } from "./toast";
import { refreshIcons } from "../lib/icons";
import type { Me } from "../lib/api";

export function renderTopbar(breadcrumb: string[], user: Me | null) {
  const el = document.getElementById("topbar")!;
  const crumbs = breadcrumb.map((b, i) =>
    i === breadcrumb.length - 1
      ? `<span class="topbar-breadcrumb-current">${b}</span>`
      : `<span>${b}</span><span style="opacity:.4">/</span>`
  ).join("");

  el.innerHTML = `
    <div class="topbar-breadcrumb">${crumbs}</div>
    <div class="topbar-spacer"></div>
    ${user ? `
      <img
        class="topbar-avatar"
        src="${user.avatar_url ?? ""}"
        alt="${user.display_name}"
        id="topbar-avatar"
        title="${user.display_name}"
      />
    ` : ""}
  `;

  refreshIcons();
  document.getElementById("topbar-avatar")?.addEventListener("click", async () => {
    if (confirm("Sign out?")) {
      await Auth.logout();
      toast("Signed out", "info");
      window.dispatchEvent(new Event("gmp:logout"));
    }
  });
}
