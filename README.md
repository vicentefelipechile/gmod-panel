# GModPanel

> Serverless administration dashboard for Garry's Mod servers. Install a Lua addon, log in with Steam, and get a full-featured web panel — no VPS, no backend process, no Docker.

---

## How it works

A single Lua addon is installed on the GMod server. On first boot it enters a guided setup mode: a linking code is displayed in the console and in-game, the server owner enters it on the dashboard, and the addon writes obfuscated credentials to disk. From that point on:

- Every **30 seconds** the addon sends a heartbeat with the current server state (map, players, FPS, tickrate). Commands enqueued from the dashboard are piggybacked on the response.
- **Immediately** on game events (player join/leave/death/chat), the addon fires an HTTP hook to the Worker.
- The **dashboard** is a SPA served directly by the Worker — no Cloudflare Pages, no R2.

```
GMod Server (Lua)
    │
    ├─ POST /api/v1/heartbeat  (every 30s)    ──→  Cloudflare Worker (Hono)
    ├─ POST /api/v1/event      (immediate)     ──→    ├─ D1 (SQL)     long-term storage
    └─ POST /api/v1/command/ack               ──→    ├─ KV           live state, cmd queues
                                                      └─ Durable Objects  WebSocket hub
                                                              │
                                               Browser SPA ──┘
                                            (served from ./app/dist)
```

---

## Stack

| Layer | Technology |
|---|---|
| **Backend** | Cloudflare Workers + [Hono](https://hono.dev) |
| **Database** | Cloudflare D1 (SQLite) |
| **Cache / queues** | Cloudflare KV |
| **Real-time** | Cloudflare Durable Objects (WebSocket hub per server) |
| **Frontend** | Vanilla TypeScript + Vite (no framework) |
| **Auth** | Steam OpenID 2.0 — no passwords |
| **GMod addon** | Lua (serverside only) |

---

## Features

- **Zero infrastructure** — nothing to host besides the GMod server itself
- **Pull-based commands** — GMod polls; no inbound port needs to be open
- **Multi-server** — one account manages multiple servers
- **Live dashboard** — real-time player list, map, FPS via Durable Objects WebSocket
- **Event log** — join/leave/death/chat with full history
- **Command & control** — kick, ban, warn, mute, message, map change, raw RCON (optional)
- **Warning system** — issue warnings from the dashboard; configurable auto-escalation (e.g. 3 warns → kick, 5 → ban)
- **Player profiles** — session history, kill/death ratio, warning history across all servers
- **Analytics** — player count over time, map breakdown, FPS/tickrate charts

---

## Project structure

```
gmod-panel/
├── src/                    # Cloudflare Worker (backend)
│   ├── index.ts            # Hono app bootstrap + route mounting
│   ├── routes/
│   │   ├── auth/steam.ts   # Steam OpenID login / logout / session
│   │   ├── server/         # heartbeat, event, handshake, command ack
│   │   └── dashboard/      # servers, players, stats, warnings
│   ├── middleware/         # verifyServerSession, verifyDashboardSession
│   ├── services/           # kv.ts, commands.ts
│   ├── objects/ServerHub.ts   # Durable Object WebSocket hub
│   └── utils/              # id, hash helpers
│
├── app/                    # SPA frontend (Vite + vanilla TS)
│   ├── main.ts             # entry: auth bootstrap + router init
│   ├── router.ts           # client-side History API router
│   ├── lib/api.ts          # typed fetch helpers for all endpoints
│   ├── lib/icons.ts        # Lucide icon wrappers
│   ├── components/         # sidebar, topbar, toast
│   ├── views/              # one file per page
│   └── styles/             # CSS partials (variables, layout, components…)
│
├── addon/                  # GMod Lua addon
│   └── lua/gmodpanel/
│       ├── sv_core.lua     # init, setup vs. normal flow
│       ├── sv_auth.lua     # handshake, session management, gmodpanel.dat
│       ├── sv_setup.lua    # first-boot: linking code, polling, .dat write
│       ├── sv_heartbeat.lua
│       ├── sv_events.lua
│       ├── sv_commands.lua # declarative executor API
│       ├── config.lua
│       └── gui/            # in-game panels (superadmins only)
│
├── migrations/             # D1 SQL migrations (wrangler d1 migrations apply)
└── wrangler.jsonc
```

---

## Local development

Requires two terminals running concurrently:

```bash
# Terminal 1 — Cloudflare Worker (backend) on :8787
npm run dev:backend

# Terminal 2 — Vite SPA (frontend) on :5173
npm run dev:app
```

Access the app at **`http://localhost:5173`**. Vite proxies `/api/*` and `/auth/*` to the Worker on `:8787`.

---

## Deployment

```bash
# Apply D1 migrations to production
npx wrangler d1 migrations apply gmodpanel

# Deploy the Worker (includes the built SPA as static assets)
npm run build:app
npm run deploy
```

Required Worker secrets:

| Secret | Description |
|---|---|
| `STEAM_API_KEY` | Steam Web API key (for profile fetches) |

---

## Authentication

Login is handled entirely through **Steam OpenID 2.0**. No passwords, no separate accounts.

1. User clicks "Sign in with Steam"
2. Worker redirects to `steamcommunity.com/openid/login`
3. Steam redirects back to `/auth/steam/callback`
4. Worker verifies the assertion via back-channel HTTP to Steam
5. Worker upserts the user in D1, issues a session token stored in KV (7-day TTL)
6. Token travels in an `HttpOnly; SameSite=Strict` cookie — never in JS

---

## Security highlights

- **api_key used once** — only during the initial handshake. All subsequent requests authenticate with an ephemeral `session_token` (2h TTL in KV).
- **gmodpanel.dat obfuscation** — `api_key` is XOR-obfuscated with a `dat_key` that is never written to disk. On restart the addon asks the Worker for the `dat_key`; without active Worker participation the `.dat` cannot be parsed.
- **Replay prevention** — handshake requests with a timestamp older than 30 seconds are rejected.
- **KV rate limiting** — sliding-window per `server_id` per minute; excess requests return `429`.
- **Ownership enforcement** — every dashboard route verifies the authenticated user owns the requested server.

---

## Database schema (D1)

| Table | Description |
|---|---|
| `users` | Steam accounts (steamid64, display name, avatar) |
| `servers` | Registered servers (owner, name, last heartbeat) |
| `server_snapshots` | Periodic state snapshots from heartbeats |
| `server_events` | Game events (join, leave, death, chat, map change…) |
| `player_sessions` | Per-player session records (joined_at, left_at, map) |
| `player_kills` | Kill feed (killer, victim, weapon, map) |
| `warnings` | Warning records (issued_by, reason, expires_at) |
| `command_log` | Audit trail for all commands issued from the dashboard |

Migrations are in `./migrations/` and managed with `wrangler d1 migrations apply`.

---

## Available commands

| Command | Payload | Description |
|---|---|---|
| `kick` | `steamid`, `reason` | Kick a player |
| `ban` | `steamid`, `reason`, `duration` (minutes) | Ban a player |
| `unban` | `steamid` | Remove a ban |
| `warn` | `steamid`, `reason` | In-game warning |
| `mute` | `steamid`, `duration` | Mute voice/text |
| `message` | `text` | Broadcast to all |
| `map_change` | `map` | Change map |
| `rcon` | `cmd` | Raw console command *(disabled by default)* |

Commands are delivered on the next heartbeat. The GMod addon acknowledges execution; failed commands are retried automatically.

---

# License

[MIT](LICENSE)
