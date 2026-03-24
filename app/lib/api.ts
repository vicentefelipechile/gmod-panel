// =========================================================================
// lib/api.ts — Typed fetch helpers for all GModPanel API endpoints
// =========================================================================

const BASE = "";

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface Server {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  last_seen: number | null;
  active: number;
}

export interface LiveState {
  timestamp: number;
  map: string;
  gamemode: string;
  player_count: number;
  max_players: number;
  fps: number;
  tickrate: number;
  players: LivePlayer[];
}

export interface LivePlayer {
  steamid: string;
  name: string;
  ping: number;
  team: string;
  playtime: number;
}

export interface ServerEvent {
  id: string;
  ts: number;
  type: string;
  data: string;
}

export interface CommandRecord {
  id: string;
  type: string;
  payload: string;
  issued_by: string;
  status: string;
  created_at: number;
  acked_at: number | null;
}

export interface Warning {
  id: string;
  server_id: string;
  steamid: string;
  issued_by: string;
  reason: string;
  created_at: number;
  expires_at: number | null;
  active: number;
}

export interface Me {
  user_id: string;
  steamid64: string;
  display_name: string;
  avatar_url: string | null;
}

// -------------------------------------------------------------------------
// Core fetch wrapper
// -------------------------------------------------------------------------

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "include",
    ...init,
  });

  if (res.status === 401) {
    window.dispatchEvent(new Event("gmp:logout"));
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// -------------------------------------------------------------------------
// Auth
// -------------------------------------------------------------------------

export const Auth = {
  me: () => req<Me>("/auth/steam/me"),
  logout: () => fetch("/auth/steam/logout", { method: "POST", credentials: "include" }),
  loginUrl: () => "/auth/steam/login",
};

// -------------------------------------------------------------------------
// Servers
// -------------------------------------------------------------------------

export const Servers = {
  list: () => req<{ servers: Server[] }>("/api/v1/servers"),

  live: (id: string) =>
    req<{ live: LiveState | null; online: boolean }>(`/api/v1/servers/${id}/live`),

  players: (id: string) =>
    req<{ players: LivePlayer[]; online: boolean }>(`/api/v1/servers/${id}/players`),

  events: (id: string, limit = 50, before?: number) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (before) qs.set("before", String(before));
    return req<{ events: ServerEvent[] }>(`/api/v1/servers/${id}/events?${qs}`);
  },

  commands: (id: string) =>
    req<{ commands: CommandRecord[] }>(`/api/v1/servers/${id}/commands`),

  sendCommand: (id: string, type: string, payload: Record<string, unknown>) =>
    req<{ ok: boolean; cmd_id: string }>(`/api/v1/servers/${id}/commands`, {
      method: "POST",
      body: JSON.stringify({ type, payload }),
    }),

  warnings: (id: string) =>
    req<{ warnings: Warning[] }>(`/api/v1/servers/${id}/warnings`),

  issueWarning: (id: string, steamid: string, reason: string, expires_at?: number) =>
    req<{ ok: boolean; warning_id: string }>(`/api/v1/servers/${id}/warnings`, {
      method: "POST",
      body: JSON.stringify({ steamid, reason, expires_at }),
    }),

  stats: {
    players: (id: string) =>
      req<{ data: { hour: number; avg_players: number; max_players: number }[] }>(
        `/api/v1/servers/${id}/stats/players`
      ),
    maps: (id: string) =>
      req<{ data: { map: string; snapshot_count: number }[] }>(
        `/api/v1/servers/${id}/stats/maps`
      ),
    performance: (id: string) =>
      req<{ data: { hour: number; avg_fps: number; min_fps: number }[] }>(
        `/api/v1/servers/${id}/stats/performance`
      ),
  },
};

// -------------------------------------------------------------------------
// Players
// -------------------------------------------------------------------------

export const Players = {
  profile: (steamid: string) =>
    req<{
      steamid64: string;
      sessions: unknown[];
      total_playtime_seconds: number;
      kills: number;
      deaths: number;
      recent_kills: unknown[];
    }>(`/api/v1/players/${steamid}`),

  warnings: (steamid: string) =>
    req<{ warnings: Warning[] }>(`/api/v1/players/${steamid}/warnings`),
};
