// =========================================================================
// views/setup.ts — Server registration / setup code confirmation
// =========================================================================

import { Auth } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import { navigate, type RouteContext } from "../router";

export async function setupView(ctx: RouteContext) {
  renderTopbar(["Server Setup"], ctx.user);

  const code = ctx.query.get("code") || "";

  return `
    <div class="page-header">
      <div class="page-title">Register Server</div>
      <div class="page-desc">Complete the installation by linking your Garry's Mod server to your dashboard account.</div>
    </div>

    <div class="card" style="max-width:480px">
      <div class="card-header"><div class="card-title">Setup Code</div></div>
      <form id="setup-form" class="flex flex-col gap-4">
        <div>
          <label class="text-sm font-medium mb-1 block">Linking Code</label>
          <input type="text" id="setup-code" class="input font-mono" placeholder="XXXX-XXXX" value="${code}" required readonly autocomplete="off" style="text-transform: uppercase; background: var(--bg-overlay); opacity: 0.8; cursor: not-allowed; user-select: none;">
          <div class="text-muted text-sm mt-1">Run <code class="font-mono">lua_run include('gmodpanel/sv_setup.lua')</code> in your server console if you don't have a code.</div>
        </div>

        <div>
          <label class="text-sm font-medium mb-1 block">Server Name</label>
          <input type="text" id="setup-name" class="input" placeholder="My TTT Server" required autocomplete="off">
        </div>

        <div id="setup-error" class="text-red text-sm hidden mt-2"></div>

        <button type="submit" class="btn btn-primary mt-2">Link Server</button>
      </form>
    </div>
  `;
}

export function setupAfter(ctx: RouteContext) {
  const form = document.getElementById("setup-form") as HTMLFormElement;
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const codeInput = document.getElementById("setup-code") as HTMLInputElement;
    const nameInput = document.getElementById("setup-name") as HTMLInputElement;
    const errorEl = document.getElementById("setup-error")!;
    const btn = form.querySelector("button")!;

    errorEl.classList.add("hidden");
    btn.disabled = true;
    btn.textContent = "Linking...";

    try {
      const res = await Auth.confirmSetup(codeInput.value.toUpperCase(), nameInput.value);
      if (res.ok) {
        const card = document.querySelector(".card");
        if (card) {
          card.innerHTML = `
            <div class="card-header"><div class="card-title text-green-400">Server Linked Successfully</div></div>
            <div class="flex flex-col gap-4 p-4 pt-0">
              <div class="text-sm">To complete the setup, copy and paste this command into your Garry's Mod server console:</div>
              <div class="bg-[var(--bg-overlay)] p-3 rounded font-mono text-sm border border-[var(--border)] select-all text-center">
                gmodpanel_register ${codeInput.value.toUpperCase()}
              </div>
              <button type="button" class="btn btn-primary mt-2" id="btn-goto-server">Go to Dashboard</button>
            </div>
          `;
          document.getElementById("btn-goto-server")?.addEventListener("click", () => {
            navigate(`/servers/${res.server_id}`);
          });
        } else {
          navigate(`/servers/${res.server_id}`);
        }
      }
    } catch (err: any) {
      errorEl.textContent = err.message || "Failed to link server. Check the code and try again.";
      errorEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Link Server";
    }
  });

  if (document.getElementById("setup-code")?.getAttribute("value")) {
    document.getElementById("setup-name")?.focus();
  }
}
