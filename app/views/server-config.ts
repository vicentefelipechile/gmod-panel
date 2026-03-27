// =========================================================================
// views/server-config.ts — Remote server configuration panel
// =========================================================================

import { Servers } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import { serverTabs } from "./server-home";
import { toast } from "../components/toast";
import { refreshIcons } from "../lib/icons";
import type { LiveState, ServerConfig } from "../lib/api";
import type { RouteContext } from "../router";

// =========================================================================
// Region options
// =========================================================================

const REGIONS = [
  { value: "-1", label: "🌍 World (Any)" },
  { value: "0", label: "🇺🇸 US East" },
  { value: "1", label: "🇺🇸 US West" },
  { value: "2", label: "🌎 South America" },
  { value: "3", label: "🇪🇺 Europe" },
  { value: "4", label: "🌏 Asia" },
  { value: "5", label: "🇦🇺 Australia" },
  { value: "6", label: "🕌 Middle East" },
  { value: "7", label: "🌍 Africa" },
];

// =========================================================================
// Sandbox convar definitions
// =========================================================================

const SBOX_BOOLEANS: { key: string; label: string; desc: string; default: number }[] = [
  { key: "sbox_godmode", label: "God Mode", desc: "All players are invincible", default: 0 },
  { key: "sbox_noclip", label: "Noclip", desc: "Players can use noclip", default: 1 },
  { key: "sbox_weapons", label: "Give Weapons", desc: "Players receive HL2 weapons on spawn", default: 1 },
  { key: "sbox_playershurtplayers", label: "Players Hurt Players", desc: "Players can damage each other", default: 1 },
  { key: "sbox_bonemanip_misc", label: "Bone Manip (misc)", desc: "Allow bone manipulation on misc entities", default: 0 },
  { key: "sbox_bonemanip_npc", label: "Bone Manip (NPCs)", desc: "Allow bone manipulation on NPCs", default: 1 },
  { key: "sbox_bonemanip_player", label: "Bone Manip (players)", desc: "Allow bone manipulation on players", default: 0 },
];

const SBOX_LIMITS: { key: string; label: string; default: number }[] = [
  { key: "sbox_maxprops", label: "Max Props", default: 200 },
  { key: "sbox_maxragdolls", label: "Max Ragdolls", default: 10 },
  { key: "sbox_maxnpcs", label: "Max NPCs", default: 10 },
  { key: "sbox_maxvehicles", label: "Max Vehicles", default: 4 },
  { key: "sbox_maxeffects", label: "Max Effects", default: 200 },
  { key: "sbox_maxballoons", label: "Max Balloons", default: 100 },
  { key: "sbox_maxbuttons", label: "Max Buttons", default: 50 },
  { key: "sbox_maxcameras", label: "Max Cameras", default: 10 },
  { key: "sbox_maxconstraints", label: "Max Constraints", default: 2000 },
  { key: "sbox_maxdynamite", label: "Max Dynamite", default: 10 },
  { key: "sbox_maxemitters", label: "Max Emitters", default: 20 },
  { key: "sbox_maxhoverballs", label: "Max Hoverballs", default: 50 },
  { key: "sbox_maxlamps", label: "Max Lamps", default: 3 },
  { key: "sbox_maxlights", label: "Max Lights", default: 5 },
  { key: "sbox_maxropeconstraints", label: "Max Rope Constraints", default: 1000 },
  { key: "sbox_maxsents", label: "Max SENTs", default: 100 },
  { key: "sbox_maxthrusters", label: "Max Thrusters", default: 50 },
  { key: "sbox_maxwheels", label: "Max Wheels", default: 50 },
];

// =========================================================================
// Helpers
// =========================================================================

function inputField(
  id: string,
  label: string,
  type: string,
  value: string | number | null | undefined,
  placeholder = "",
  hint = "",
  extra = "",
  disabled = false,
) {
  const v = value != null ? String(value) : "";
  return `
    <div class="form-group">
      <label class="form-label" for="${id}">${label}</label>
      <input class="form-input" type="${type}" id="${id}" name="${id}"
        value="${v}" placeholder="${placeholder}" ${extra} ${disabled ? "disabled" : ""}/>
      ${hint ? `<div class="hint text-muted text-sm"><i data-lucide="info" style="width:13px;height:13px;margin-bottom:-2px"></i> ${hint}</div>` : ""}
    </div>`;
}

function mapField(currentMap: string | null | undefined, liveMaps: string[]) {
  const val = currentMap ?? "";
  if (liveMaps.length === 0) {
    return inputField("cfg-map", "Map", "text", val, "gm_flatgrass",
      "Server offline — type the exact map name.", 'autocomplete="off"');
  }
  const options = liveMaps.map(m =>
    `<option value="${m}" ${m === val ? "selected" : ""}>${m}</option>`
  ).join("");
  return `
    <div class="form-group">
      <label class="form-label" for="cfg-map">Map</label>
      <select class="form-select" id="cfg-map">
        <option value="">— Keep current (${val || "unknown"}) —</option>
        ${options}
      </select>
      <div class="hint text-muted text-sm">
        <i data-lucide="info" style="width:13px;height:13px;margin-bottom:-2px"></i>
        Map changes use <code>changelevel</code> — players stay connected.
      </div>
    </div>`;
}

function toggle(id: string, label: string, desc: string, checked: boolean) {
  return `
    <div class="config-toggle-row">
      <div>
        <div class="config-toggle-label">${label}</div>
        <div class="text-sm text-muted">${desc}</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="${id}" name="${id}" ${checked ? "checked" : ""} />
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </label>
    </div>`;
}

function section(icon: string, title: string, content: string) {
  return `
    <div class="card config-section">
      <div class="card-header">
        <div class="card-title">
          <i data-lucide="${icon}" style="width:16px;height:16px;margin-right:8px;margin-bottom:-2px"></i>${title}
        </div>
      </div>
      <div class="config-section-body">${content}</div>
    </div>`;
}

/** Sandbox limits rendered in a compact 2-col grid */
function sandboxLimitsGrid(cfg: ServerConfig | null): string {
  const items = SBOX_LIMITS.map(({ key, label, default: def }) => {
    const val = (cfg as any)?.[key] ?? def;
    return `
      <div class="form-group">
        <label class="form-label" for="${key}" style="font-size:11px">${label}</label>
        <input class="form-input" type="number" id="${key}" name="${key}"
          value="${val}" min="0" max="99999" style="padding:6px 10px;font-size:13px" />
      </div>`;
  }).join("");
  return `<div class="sbox-limits-grid">${items}</div>`;
}

function sandboxBooleansSection(cfg: ServerConfig | null): string {
  return SBOX_BOOLEANS.map(({ key, label, desc, default: def }) => {
    const val = (cfg as any)?.[key] ?? def;
    return toggle(key, label, desc, !!val);
  }).join("");
}

// =========================================================================
// View
// =========================================================================

export async function serverConfigView(ctx: RouteContext): Promise<string> {
  const id = ctx.params.id;
  renderTopbar(["Servers", id, "Config"], ctx.user);

  let cfg: ServerConfig | null = null;
  let live: LiveState | null = null;

  try {
    [{ config: cfg }, { live }] = await Promise.all([
      Servers.getConfig(id),
      Servers.live(id).then(r => ({ live: r.live })).catch(() => ({ live: null })),
    ]);
  } catch {
    return `${serverTabs(id, "config")}<div class="empty-state"><div class="empty-title">Failed to load config</div></div>`;
  }

  // Merge: DB config is the source of truth; live state fills gaps
  const effective = {
    server_name: cfg?.server_name ?? live?.server_name ?? "",
    map: cfg?.map ?? live?.map ?? "",
    gamemode: cfg?.gamemode ?? live?.gamemode ?? "",
    max_players: cfg?.max_players ?? live?.max_players ?? "",
    region: cfg?.region ?? String(live?.region ?? "-1"),
    sv_password: cfg?.sv_password ?? live?.sv_password ?? "",
    friendlyfire: cfg?.friendlyfire ?? live?.friendlyfire ?? 0,
  };

  const liveMaps = live?.maps ?? [];
  const isSandbox = (effective.gamemode || "").toLowerCase() === "sandbox";

  const lastUpdated = cfg?.updated_at
    ? `<span class="text-muted text-sm">Last saved: ${new Date(cfg.updated_at).toLocaleString()}</span>`
    : `<span class="text-muted text-sm">Showing current live values — save to persist</span>`;

  return `
    ${serverTabs(id, "config")}

    <form id="config-form">
      <div class="config-grid">

        <!-- Left column -->
        <div class="config-col">
          ${section("globe", "Identity", `
            ${inputField("cfg-server-name", "Server Name", "text",
    effective.server_name, "My GMod Server")}
            <div class="form-group">
              <label class="form-label" for="cfg-region">Region</label>
              <select class="form-select" id="cfg-region">
                ${REGIONS.map(r =>
      `<option value="${r.value}" ${String(effective.region) === r.value ? "selected" : ""}>${r.label}</option>`
    ).join("")}
              </select>
            </div>
          `)}

          ${section("globe-2", "World", `
            ${mapField(effective.map, liveMaps)}
            ${inputField("cfg-gamemode", "Gamemode", "text", effective.gamemode, "sandbox")}
            ${inputField("cfg-max-players", "Max Players", "number", effective.max_players, "16",
      "Cannot be changed on a live server — restart required.", 'min="1" max="128"', true)}
          `)}

          ${section("shield", "Security", `
            ${inputField("cfg-sv-password", "Server Password", "text",
        effective.sv_password, "Leave empty for no password")}
          `)}

          ${section("zap", "Quick Actions", `
            <div class="config-actions-grid">
              <button type="button" class="btn btn-secondary config-action-btn" data-action="restart_map">
                <i data-lucide="refresh-cw" style="width:14px;height:14px"></i> Restart Map
              </button>
              <button type="button" class="btn btn-secondary config-action-btn" data-action="clean_entities">
                <i data-lucide="trash-2" style="width:14px;height:14px"></i> Clean Entities
              </button>
            </div>
            <div class="form-group" style="margin-top:12px">
              <label class="form-label" for="cfg-run-cmd">Run Console Command</label>
              <div style="display:flex;gap:8px">
                <input class="form-input mono" type="text" id="cfg-run-cmd"
                  placeholder="sv_cheats 1, say Hello, ..." style="flex:1" />
                <button type="button" class="btn btn-primary" id="cfg-run-cmd-btn">
                  <i data-lucide="terminal" style="width:14px;height:14px"></i> Run
                </button>
              </div>
            </div>
          `)}
        </div>

        <!-- Right column -->
        <div class="config-col">
          ${section("sliders", "Gameplay", `
            ${toggle("cfg-friendlyfire", "Friendly Fire",
          "Players can damage each other (mp_friendlyfire)", !!(effective.friendlyfire))}
          `)}

          ${isSandbox ? section("box", "Sandbox", `
            <div class="text-muted text-sm" style="margin-bottom:12px">
              These settings are applied immediately via convar on the live server.
            </div>
            ${sandboxBooleansSection(cfg)}
            <div class="form-label" style="margin-top:16px;margin-bottom:8px">Spawn Limits <span class="text-muted text-sm">(per player)</span></div>
            ${sandboxLimitsGrid(cfg)}
          `) : `
            <div class="card" style="border:1px dashed var(--border);background:transparent">
              <div class="empty-state" style="padding:24px">
                <div class="empty-icon"><i data-lucide="box" style="width:28px;height:28px"></i></div>
                <div class="empty-title" style="font-size:13px">Sandbox Settings</div>
                <div class="empty-desc">Only available when the gamemode is set to <strong>sandbox</strong>. Current: <code>${effective.gamemode || "unknown"}</code></div>
              </div>
            </div>
          `}
        </div>
      </div>

      <!-- Footer -->
      <div class="config-footer" id="config-footer"
        data-effective='${JSON.stringify({
            ...effective,
            ...Object.fromEntries(SBOX_BOOLEANS.map(({ key, default: def }) => [key, (cfg as any)?.[key] ?? def])),
            ...Object.fromEntries(SBOX_LIMITS.map(({ key, default: def }) => [key, (cfg as any)?.[key] ?? def])),
          })}'>
        ${lastUpdated}
        <button type="submit" class="btn btn-primary" id="config-save-btn">
          <i data-lucide="save" style="width:14px;height:14px"></i> Save &amp; Apply
        </button>
      </div>
    </form>
  `;
}

// =========================================================================
// After hook
// =========================================================================

export function serverConfigAfter(ctx: RouteContext) {
  const id = ctx.params.id;

  // Read the initial effective snapshot embedded by the view
  const footer = document.getElementById("config-footer");
  let effective: Record<string, unknown> = {};
  try { effective = JSON.parse(footer?.dataset.effective ?? "{}"); } catch { }

  // Save form
  const form = document.getElementById("config-form") as HTMLFormElement;
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("config-save-btn") as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" style="width:14px;height:14px"></i> Saving…`;
    refreshIcons();

    // Collect all field values from the DOM
    const allFields: Record<string, string | number | boolean | null> = {};
    allFields.server_name = (document.getElementById("cfg-server-name") as HTMLInputElement)?.value.trim() || null;
    allFields.map = (document.getElementById("cfg-map") as HTMLSelectElement | HTMLInputElement)?.value.trim() || null;
    allFields.gamemode = (document.getElementById("cfg-gamemode") as HTMLInputElement)?.value.trim() || null;
    allFields.region = (document.getElementById("cfg-region") as HTMLSelectElement)?.value ?? "-1";
    allFields.sv_password = (document.getElementById("cfg-sv-password") as HTMLInputElement)?.value || null;
    allFields.friendlyfire = (document.getElementById("cfg-friendlyfire") as HTMLInputElement)?.checked ? 1 : 0;

    // Sandbox booleans
    for (const { key } of SBOX_BOOLEANS) {
      const el = document.getElementById(key) as HTMLInputElement | null;
      if (el) allFields[key] = el.checked ? 1 : 0;
    }
    // Sandbox limits
    for (const { key } of SBOX_LIMITS) {
      const el = document.getElementById(key) as HTMLInputElement | null;
      if (el && el.value !== "") allFields[key] = parseInt(el.value) || 0;
    }

    // KEY FIX: only send fields that actually changed from the effective baseline.
    // Prevents accidental map changes when only server name was updated.
    const changed: Record<string, string | number | boolean | null> = {};
    for (const [key, val] of Object.entries(allFields)) {
      if (String(effective[key] ?? "") !== String(val ?? "")) {
        changed[key] = val;
      }
    }

    if (Object.keys(changed).length === 0) {
      toast("No changes detected", "info");
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="save" style="width:14px;height:14px"></i> Save &amp; Apply`;
      refreshIcons();
      return;
    }

    try {
      const { queued } = await Servers.setConfig(id, changed);
      const n = queued.length;
      toast(`Config saved — ${n} change${n === 1 ? "" : "s"} applied`, "success");
      // Update baseline so re-submitting doesn't re-enqueue same changes
      Object.assign(effective, changed);
    } catch (err: any) {
      toast(`Failed to save: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="save" style="width:14px;height:14px"></i> Save &amp; Apply`;
      refreshIcons();
    }
  });

  // Quick action buttons
  document.querySelectorAll<HTMLButtonElement>(".config-action-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action!;
      const orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" style="width:14px;height:14px"></i> Sending…`;
      refreshIcons();
      try {
        await Servers.sendCommand(id, "server_config", { field: action, value: null });
        toast(`"${btn.textContent?.trim()}" queued`, "success");
      } catch (err: any) {
        toast(`Failed: ${err.message}`, "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
        refreshIcons();
      }
    });
  });

  // Run console command
  const runBtn = document.getElementById("cfg-run-cmd-btn") as HTMLButtonElement;
  runBtn?.addEventListener("click", async () => {
    const input = document.getElementById("cfg-run-cmd") as HTMLInputElement;
    const cmd = input.value.trim();
    if (!cmd) { toast("Enter a command first", "info"); return; }
    const orig = runBtn.innerHTML;
    runBtn.disabled = true;
    runBtn.innerHTML = `<i data-lucide="loader" style="width:14px;height:14px"></i>`;
    refreshIcons();
    try {
      await Servers.sendCommand(id, "server_config", { field: "run_command", value: cmd });
      toast(`Command queued: ${cmd}`, "success");
      input.value = "";
    } catch (err: any) {
      toast(`Failed: ${err.message}`, "error");
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = orig;
      refreshIcons();
    }
  });
}