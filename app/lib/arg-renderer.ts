// =========================================================================
// lib/arg-renderer.ts — Smart argument field renderer for the command form.
// Maps each arg.type to the appropriate HTML input control.
// =========================================================================

import type { CommandArgMeta, LiveState } from "./api";

// =========================================================================
// Duration presets
// =========================================================================

const DURATION_OPTIONS = [
  { value: "0.5",    label: "30 seconds" },
  { value: "1",      label: "1 minute" },
  { value: "5",      label: "5 minutes" },
  { value: "10",     label: "10 minutes" },
  { value: "30",     label: "30 minutes" },
  { value: "60",     label: "1 hour" },
  { value: "120",    label: "2 hours" },
  { value: "300",    label: "5 hours" },
  { value: "600",    label: "10 hours" },
  { value: "1440",   label: "1 day" },
  { value: "2880",   label: "2 days" },
  { value: "7200",   label: "5 days" },
  { value: "10080",  label: "7 days" },
  { value: "20160",  label: "14 days" },
  { value: "44640",  label: "31 days" },
  { value: "0",      label: "Permanent" },
];

// =========================================================================
// Field ID helper (unique per arg in a form)
// =========================================================================

export function argFieldId(argName: string) {
  return `arg-${argName}`;
}

// =========================================================================
// renderArgField — returns an HTML string for one argument
// =========================================================================

export function renderArgField(arg: CommandArgMeta, live: LiveState | null): string {
  const id    = argFieldId(arg.name);
  const label = arg.label || arg.name;
  const req   = arg.required ? '<span class="arg-required" title="Required">*</span>' : "";

  const wrap = (inner: string) => `
    <div class="form-group arg-field" data-arg="${arg.name}" data-type="${arg.type}">
      <label class="form-label" for="${id}">${label}${req}</label>
      ${inner}
    </div>`;

  switch (arg.type) {

    // -----------------------------------------------------------------------
    // player / target — dropdown from live player list
    // -----------------------------------------------------------------------
    case "player":
    case "target": {
      const players = live?.players ?? [];
      if (players.length === 0) {
        return wrap(`
          <select class="form-select arg-input" id="${id}" ${arg.required ? "required" : ""}>
            <option value="">— No players online —</option>
          </select>
          <div class="text-muted text-sm" style="margin-top:4px">No players currently online.</div>`);
      }
      const options = players.map(p =>
        `<option value="${p.steamid}">${p.name} (${p.steamid})</option>`
      ).join("");
      return wrap(`
        <select class="form-select arg-input" id="${id}" ${arg.required ? "required" : ""}>
          <option value="">Select player…</option>
          ${options}
        </select>`);
    }

    // -----------------------------------------------------------------------
    // team — dropdown from live team list
    // -----------------------------------------------------------------------
    case "team": {
      const teams = live?.teams ?? [];
      const options = teams.map(t =>
        `<option value="${t.index}">${t.name} (${t.index})</option>`
      ).join("");
      return wrap(`
        <select class="form-select arg-input" id="${id}" ${arg.required ? "required" : ""}>
          <option value="">Select team…</option>
          ${options}
        </select>`);
    }

    // -----------------------------------------------------------------------
    // map — dropdown from live map list
    // -----------------------------------------------------------------------
    case "map": {
      const maps = live?.maps ?? [];
      const current = live?.map ?? "";
      if (maps.length === 0) {
        return wrap(`<input class="form-input arg-input" type="text" id="${id}"
          placeholder="gm_flatgrass" ${arg.required ? "required" : ""} />`);
      }
      const options = maps.map(m =>
        `<option value="${m}" ${m === current ? "selected" : ""}>${m}</option>`
      ).join("");
      return wrap(`
        <select class="form-select arg-input" id="${id}" ${arg.required ? "required" : ""}>
          <option value="">Select map…</option>
          ${options}
        </select>`);
    }

    // -----------------------------------------------------------------------
    // duration — preset dropdown (values are in minutes)
    // -----------------------------------------------------------------------
    case "duration": {
      const options = DURATION_OPTIONS.map(d =>
        `<option value="${d.value}">${d.label}</option>`
      ).join("");
      return wrap(`
        <select class="form-select arg-input" id="${id}" ${arg.required ? "required" : ""}>
          ${options}
        </select>`);
    }

    // -----------------------------------------------------------------------
    // steamid64 — validated text input
    // -----------------------------------------------------------------------
    case "steamid64": {
      return wrap(`
        <input class="form-input arg-input" type="text" id="${id}"
          placeholder="76561198000000000"
          pattern="[0-9]{17}"
          title="Must be a valid 64-bit SteamID (17 digits)"
          maxlength="17"
          ${arg.required ? "required" : ""} />`);
    }

    // -----------------------------------------------------------------------
    // reason — text input styled distinct
    // -----------------------------------------------------------------------
    case "reason": {
      return wrap(`
        <input class="form-input arg-input" type="text" id="${id}"
          placeholder="Reason…"
          ${arg.required ? "required" : ""} />`);
    }

    // -----------------------------------------------------------------------
    // number — numeric input
    // -----------------------------------------------------------------------
    case "number": {
      return wrap(`
        <input class="form-input arg-input" type="number" id="${id}"
          placeholder="0"
          ${arg.required ? "required" : ""} />`);
    }

    // -----------------------------------------------------------------------
    // boolean — Yes / No select
    // -----------------------------------------------------------------------
    case "boolean": {
      return wrap(`
        <select class="form-select arg-input" id="${id}" ${arg.required ? "required" : ""}>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>`);
    }

    // -----------------------------------------------------------------------
    // command — monospace input for console commands
    // -----------------------------------------------------------------------
    case "command": {
      return wrap(`
        <input class="form-input arg-input mono" type="text" id="${id}"
          placeholder='say "Hello!" or any server command'
          ${arg.required ? "required" : ""} />`);
    }

    // -----------------------------------------------------------------------
    // text / string (default)
    // -----------------------------------------------------------------------
    default: {
      return wrap(`
        <input class="form-input arg-input" type="text" id="${id}"
          placeholder="${label}…"
          ${arg.required ? "required" : ""} />`);
    }
  }
}

// =========================================================================
// gatherArgValues — reads DOM values for a set of args into a payload object.
// Returns null if a required field is missing / invalid.
// =========================================================================

export function gatherArgValues(
  args: CommandArgMeta[]
): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {};

  for (const arg of args) {
    const el = document.getElementById(argFieldId(arg.name)) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;

    if (!el) continue;

    const raw = el.value.trim();

    // Required validation
    if (arg.required && !raw) {
      el.focus();
      el.style.borderColor = "var(--red)";
      setTimeout(() => { el.style.borderColor = ""; }, 2000);
      return null;
    }

    // SteamID64 validation
    if (arg.type === "steamid64" && raw) {
      if (!/^[0-9]{17}$/.test(raw)) {
        el.focus();
        el.style.borderColor = "var(--red)";
        setTimeout(() => { el.style.borderColor = ""; }, 2000);
        return null;
      }
    }

    if (!raw && !arg.required) {
      // Skip optional empty fields
      continue;
    }

    // Type coercion
    if (arg.type === "number") {
      payload[arg.name] = parseFloat(raw) || 0;
    } else if (arg.type === "duration") {
      payload[arg.name] = parseFloat(raw) || 0;
    } else if (arg.type === "boolean") {
      payload[arg.name] = raw === "true";
    } else {
      payload[arg.name] = raw;
    }
  }

  return payload;
}
