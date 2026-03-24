# GModPanel — Serverless Garry's Mod Server Dashboard

> A fully serverless administration platform for Garry's Mod servers, powered by Cloudflare Workers, D1, KV, and Durable Objects. Server owners install a Lua addon, authenticate via Steam, and get a full-featured dashboard to monitor and control their servers in real time.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Data Flow](#3-data-flow)
4. [Cloudflare Infrastructure](#4-cloudflare-infrastructure)
5. [GMod Addon (Lua)](#5-gmod-addon-lua)
6. [Authentication — Steam OpenID](#6-authentication--steam-openid)
7. [API Design](#7-api-design)
8. [Command & Control System](#8-command--control-system)
9. [Statistics & Analytics](#9-statistics--analytics)
10. [Warning System](#10-warning-system)
11. [Dashboard Frontend](#11-dashboard-frontend)
12. [Database Schema (D1) & Migrations](#12-database-schema-d1--migrations)
13. [KV Schema](#13-kv-schema)
14. [Durable Objects](#14-durable-objects)
15. [Security Model](#15-security-model)
16. [Roadmap](#16-roadmap)

---

## 1. Project Overview

GModPanel lets Garry's Mod server owners install a single Lua addon and immediately gain access to a hosted web dashboard. There is no dedicated backend server to run or maintain — everything lives on Cloudflare's edge.

### Core principles

- **Zero infrastructure overhead** — no VPS, no Node.js process, no Docker. The owner only needs their GMod server and a Cloudflare account.
- **Pull-based command delivery** — the GMod server polls the Worker on every heartbeat and receives queued commands in the response, so no inbound port needs to be open.
- **Event-driven hooks** — critical events (player kill, player connect/disconnect, chat, etc.) are sent immediately via HTTP, independent of the heartbeat interval.
- **Steam-native auth** — login is handled via Steam OpenID; no passwords or separate accounts.
- **Multi-server support** — one dashboard account can manage multiple registered servers.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GMod Server (Lua)                    │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐  ┌─────────────┐  │
│  │  Heartbeat   │   │ Event Hooks  │  │ CMD Executor│  │
│  │ (30s / 60s)  │   │ (immediate)  │  │             │  │
│  └──────┬───────┘   └──────┬───────┘  └──────▲──────┘  │
│         │                  │                  │          │
└─────────┼──────────────────┼──────────────────┼─────────┘
          │  HTTP POST        │  HTTP POST        │ HTTP response
          ▼                  ▼                  │
┌─────────────────────────────────────────────────────────┐
│               Cloudflare Workers (Hono)                 │
│                                                         │
│  POST /api/v1/heartbeat     POST /api/v1/event          │
│  POST /api/v1/command/ack   GET  /api/v1/command/queue  │
│  GET  /api/v1/stats/*       POST /auth/steam/*          │
│  GET  /*  ← serves ./app/dist/** (static SPA)           │
│                                                         │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐  │
│  │   D1 (SQL)   │  │  KV (cache)    │  │  Durable    │  │
│  │  long-term   │  │  live state    │  │  Objects    │  │
│  │  analytics   │  │  cmd queues    │  │  (realtime) │  │
│  └──────────────┘  └────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│              Dashboard SPA — static files               │
│   Served by the Worker from ./app/dist/**               │
│   (no Cloudflare Pages, no R2)                          │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow

### 3.0 Initial setup (first boot)

If `gmodpanel.dat` does not exist, the addon enters setup mode before any heartbeat.

```
GMod → Worker → GET /api/v1/setup/code  (anonymous, no credentials)
              → generates ephemeral setup_code (e.g. "XXXX-XXXX")
              → stores in KV: setup:{code} → { pending: true }  TTL 10 min
GMod ← Worker ← { setup_code, expires_in: 600 }

GMod prints to console and GUI: URL + setup_code
GMod starts polling → GET /api/v1/setup/poll?code=XXXX-XXXX  (every 5s)
              → Worker replies 202 while waiting

Superadmin opens URL → logs in with Steam → enters setup_code → confirms linking
Worker → creates server_id + api_key → saves to D1 → updates KV setup:{code} → { server_id, api_key }

GMod polling → Worker replies 200 + { server_id, api_key }
GMod writes data/gmodpanel.dat with obfuscated credentials
GMod calls LoadIdentity() → starts normal handshake flow
```

### 3.1 Handshake (on server start / map load)

Before any heartbeat or event can be sent, the addon must establish a session with the Worker.

```
GMod → Worker → POST /api/v1/handshake  (server_id + api_key, read from gmodpanel.dat)
              → verifies credentials
              → generates ephemeral session_token (32-byte random)
              → stores in KV: handshake:{server_id} → { session_token, issued_at }
GMod ← Worker ← { session_token, expires_in }
GMod stores session_token in memory (GModPanel.Session.token)
```

All subsequent requests use `X-Session-Token` instead of the `api_key`. The `api_key` never travels in repeated requests.

### 3.2 Heartbeat (periodic)

Every N seconds the Lua addon sends a `POST /api/v1/heartbeat` with the server's current state snapshot.

```
GMod → Worker → writes to D1 (player counts, map, fps, tickrate)
              → updates KV live state
              → returns pending command queue
GMod ← Worker ← [{ id, type, payload }]  ← commands are piggybacked on the response
```

### 3.3 Event hook (immediate)

Certain game events bypass the heartbeat and are sent instantly.

```
GMod → Worker → POST /api/v1/event
              → writes event row to D1
              → updates KV counters
              → (optional) triggers Durable Object for real-time push
```

### 3.4 Command flow

```
Dashboard user → POST /api/v1/command      → stores command in KV queue
GMod heartbeat → GET  response payload     → receives command list
GMod executes  → POST /api/v1/command/ack  → marks command as done/failed
```

---

## 4. Cloudflare Infrastructure

| Service | Purpose |
|---|---|
| **Workers** | All API logic, auth, routing (Hono) **and** serving the static frontend from `./app/dist/**` |
| **D1** | Persistent relational storage — events, stats, users, servers, warnings. Migrations in `./migrations/` |
| **KV** | Live server state, command queues, session tokens, rate-limit counters |
| **Durable Objects** | Per-server real-time WebSocket hub (dashboard live view) |

> **No R2, no Pages.** The frontend (SPA compiled to `./app/dist/`) is served directly by the Worker. Any route that does not match `/api/*` or `/auth/*` returns the SPA's `index.html`.

### Why this split

- D1 handles anything that needs querying across time (charts, history, player lookup). It's slow to write but cheap and queryable.
- KV handles anything that needs sub-millisecond reads with a short TTL: the live player list, current map, command queues. Keys expire automatically when a server goes offline.
- Durable Objects give the dashboard a live push channel without a persistent server process.

---

## 5. GMod Addon (Lua)

### 5.1 File structure

```
addon/
├── addon.json
└── lua/
    └── gmodpanel/
        ├── sv_core.lua          # main init, enters setup or handshake depending on state
        ├── sv_heartbeat.lua     # periodic HTTP sender
        ├── sv_events.lua        # hook registrations
        ├── sv_commands.lua      # incoming command executor
        ├── sv_auth.lua          # handshake, session token management, reads gmodpanel.dat
        ├── sv_setup.lua         # first-boot flow: setup_code, polling, writing gmodpanel.dat
        ├── config.lua           # general parameters only (heartbeat interval, debug) — no credentials
        └── gui/
            ├── cl_gui.lua           # main window (DFrame, tabs), superadmins only
            ├── cl_setup.lua         # first-boot screen: shows setup_code and URL
            ├── cl_status.lua        # status tab (active session, last heartbeat, errors)
            └── sh_netmessages.lua   # net messages client <-> server
```

> **`gmodpanel.dat`** — file automatically generated at `data/gmodpanel.dat` after successful linking. Contains `server_id` and `api_key` **obfuscated**. The content can only be de-obfuscated using a **unique identifier delivered by the Worker** at setup time (`dat_key`), which is never written to disk — it only exists in memory during the session. Without that `dat_key`, the file cannot be parsed. If someone copies the `.dat` to another server, they cannot de-obfuscate it because the `dat_key` was ephemeral. The `dat_key` rotates on every new setup.

### 5.2 Backend structure (`./src/`)

```
src/
├── routes/
│   ├── server/
│   │   ├── heartbeat.ts
│   │   ├── event.ts
│   │   ├── handshake.ts
│   │   └── command.ts
│   ├── dashboard/
│   │   ├── servers.ts
│   │   ├── players.ts
│   │   ├── stats.ts
│   │   └── warnings.ts
│   └── auth/
│       └── steam.ts
├── middleware/
│   ├── verifyServerSession.ts
│   └── verifyDashboardSession.ts
├── services/
│   ├── kv.ts
│   ├── d1.ts
│   └── commands.ts
├── objects/
│   └── ServerHub.ts
├── utils/
│   ├── hash.ts
│   └── id.ts
└── index.ts
```

### 5.3 Frontend structure (`./app/`)

```
app/
├── pages/
│   ├── index.tsx
│   ├── servers/
│   │   ├── index.tsx
│   │   └── [id]/
│   │       ├── index.tsx
│   │       ├── players.tsx
│   │       ├── stats.tsx
│   │       ├── events.tsx
│   │       ├── commands.tsx
│   │       └── warnings.tsx
│   ├── players/
│   │   └── [steamid].tsx
│   └── settings.tsx
├── components/
│   ├── ui/
│   ├── PlayerCard.tsx
│   ├── CommandForm.tsx
│   ├── EventFeed.tsx
│   └── StatChart.tsx
├── hooks/
│   ├── useWebSocket.ts
│   └── useServer.ts
├── lib/
│   └── api.ts
└── main.tsx
```

### 5.4 Code Style — File Headers & Sections

Every file in the project **must** begin with a header block that identifies the file and its purpose. Internal sections are also separated by headers in the same style.

#### Lua files (`.lua`)

```lua
--[[--------------------------------------------------------------------
    sv_heartbeat.lua
    Periodic HTTP heartbeat sender. Builds the server state payload and
    sends it to the Worker every N seconds. Processes the command queue
    returned in the response.
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Variables
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Functions
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Hooks / Timers
--------------------------------------------------------------------]]--
```

**Standard sections** by file type:

| File | Typical sections |
|---|---|
| `sv_core.lua` | Variables · Functions · Init |
| `sv_heartbeat.lua` | Variables · Functions · Timers |
| `sv_events.lua` | Variables · Functions · Hooks |
| `sv_commands.lua` | Variables · Executor API · Command Declarations · Command Processor |
| `sv_auth.lua` | Variables · Internal Functions · Public API · Timers |
| `sv_setup.lua` | Variables · Functions · Init |
| `config.lua` | Config · Session State |
| `cl_gui.lua` | Variables · Components · Functions · Init |
| `sh_netmessages.lua` | Net Message Declarations · Receivers |

#### TypeScript / TSX files (`.ts` / `.tsx`)

```ts
// =========================================================================
// src/routes/server/heartbeat.ts
// Handles POST /api/v1/heartbeat — receives a server state snapshot,
// updates KV live state, and returns the pending command queue.
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

// =========================================================================
// Constants
// =========================================================================

// =========================================================================
// Types
// =========================================================================

// =========================================================================
// Handler
// =========================================================================
```

**Standard sections** by file type:

| File | Typical sections |
|---|---|
| `src/routes/**/*.ts` | Imports · Constants · Types · Handler |
| `src/middleware/*.ts` | Imports · Types · Middleware |
| `src/services/*.ts` | Imports · Constants · Types · Functions |
| `src/objects/ServerHub.ts` | Imports · Types · Class |
| `src/utils/*.ts` | Imports · Functions |
| `src/index.ts` | Imports · Constants · App Bootstrap · Routes · Export |
| `app/pages/**/*.tsx` | Imports · Types · Hooks · Components · Page |
| `app/components/**/*.tsx` | Imports · Types · Component |
| `app/hooks/*.ts` | Imports · Types · Hook |
| `app/lib/api.ts` | Imports · Constants · Types · Functions |

> **Rule:** the file header always states the relative path from the project root and a one-or-two line description of what it does. It is never omitted, even for small files.

### 5.5 Configuration (`config.lua`)

`config.lua` contains only general parameters. **No credentials here.**

```lua
GModPanel = GModPanel or {}
GModPanel.Config = {
    api_base  = "https://gmodpanel.vicentefelipechile.workers.dev",
    heartbeat = 30,    -- seconds between each heartbeat
    debug     = false,
}

-- Runtime state (never persisted to disk)
GModPanel.Session = {
    token      = nil,  -- ephemeral token received from handshake
    expires_at = 0,
}
```

### 5.5.1 GModPanel.Identity — restricted access

`GModPanel.Identity` holds the de-obfuscated `server_id` and `api_key` and **MUST NEVER be exposed, stored, copied, or accessed manually** from any other module.

**Golden rules:**
- `GModPanel.Identity` is a private, read-only table internal to `sv_auth.lua`.
- The only code allowed to read its fields are the internal fetch functions (`GModPanel.Handshake`, `GModPanel.EnsureSession`, etc.) — no external code.
- Any module that needs authentication must call `GModPanel.EnsureSession(callback)` and use `GModPanel.AuthHeaders()` — never access `GModPanel.Identity` directly.
- No log, print, or debug output may contain the values of `GModPanel.Identity`.

```lua
-- sv_auth.lua (internal — do not expose outside this file)
local Identity = {
    server_id = nil,
    api_key   = nil,
}
-- GModPanel.Identity does NOT exist as an accessible global;
-- external access is redirected to nil to prevent accidental reads.
GModPanel.Identity = nil  -- explicitly nil in the global namespace
```

### 5.5.2 Print system — GModPanel.Print / Warn / Error

All console output from the addon goes through these three functions. Never use `print()`, `Msg()`, or `MsgC()` directly.

```lua
-- sv_core.lua (or shared sh_print.lua)
local PREFIX = "[GModPanel] "

function GModPanel.Print(...)
    MsgC(Color(120, 200, 255), PREFIX, ...)
    MsgC(Color(255, 255, 255), "\n")
end

function GModPanel.Warn(...)
    MsgC(Color(255, 200, 50), PREFIX .. "[WARN] ", ...)
    MsgC(Color(255, 255, 255), "\n")
end

function GModPanel.Error(...)
    MsgC(Color(255, 80, 80), PREFIX .. "[ERROR] ", ...)
    MsgC(Color(255, 255, 255), "\n")
end

-- Usage in any other module:
-- GModPanel.Print("Session established.")
-- GModPanel.Warn("Session expiring soon, renewing...")
-- GModPanel.Error("Handshake failed: HTTP ", code)
```

### 5.6 First-boot flow (`sv_setup.lua`)

If `gmodpanel.dat` does not exist, the addon enters setup mode. The superadmin will see a console message with the URL and the linking code. The addon polls until the Worker confirms the link, then writes `gmodpanel.dat` and starts the normal flow.

```
1. sv_core.lua starts → checks if data/gmodpanel.dat exists
   → does NOT exist: enters setup mode (sv_setup.lua)
   → exists: loads and de-obfuscates credentials, starts normal handshake (sv_auth.lua)

2. sv_setup.lua → GET /api/v1/setup/code  (anonymous request, no credentials)
   Worker replies → { setup_code: "XXXX-XXXX", dat_key: "<random>", expires_in: 600 }
   setup_code and dat_key stored IN MEMORY ONLY — never written to disk

3. Server console prints (via GModPanel.Print):
   [GModPanel] Addon not configured. Visit:
   [GModPanel] https://gmodpanel.vicentefelipechile.workers.dev/setup
   [GModPanel] Linking code: XXXX-XXXX  (expires in 10 min)

4. GUI shows cl_setup.lua to the superadmin with the same code and URL

5. sv_setup.lua polls every 5s → GET /api/v1/setup/poll?code=XXXX-XXXX
   → Worker replies 202 while waiting for confirmation
   → Worker replies 200 + { server_id, api_key } when the superadmin accepts on the dashboard

6. sv_setup.lua receives credentials:
   → Obfuscates { server_id, api_key } using dat_key (XOR + base64 or similar scheme)
   → Writes data/gmodpanel.dat (obfuscated content, unreadable without dat_key)
   → dat_key is NOT written to disk; kept in memory for the current session
   → Calls LoadIdentity(dat_key) to load de-obfuscated credentials into memory
   → Starts normal handshake flow

NOTE: If the server restarts after setup, the dat_key is no longer in memory.
      sv_auth.lua asks the Worker for a new read dat_key by sending server_id (which is
      stored in plaintext in the .dat header; only api_key is obfuscated) → Worker validates
      and delivers the dat_key. This ensures the .dat can only be de-obfuscated with active
      Worker participation.
```

### 5.7 Handshake (`sv_auth.lua`)

Reads credentials from `gmodpanel.dat` on startup. Called once at boot and again if the session token is rejected with `401`.

```lua
-- sv_auth.lua
-- Identity is a LOCAL table to this module; it does not exist as a global
local Identity = { server_id = nil, api_key = nil }

-- Asks the Worker for the dat_key to de-obfuscate the .dat on restart
local function FetchDatKey(server_id, callback)
    http.Fetch(
        GModPanel.Config.api_base .. "/api/v1/setup/datkey?server_id=" .. server_id,
        function(body, _, _, code)
            if code ~= 200 then
                GModPanel.Error("Could not fetch dat_key from Worker: HTTP ", code)
                return
            end
            local res = util.JSONToTable(body)
            if res and res.dat_key then callback(res.dat_key) end
        end,
        function(err) GModPanel.Error("FetchDatKey error: ", err) end
    )
end

-- De-obfuscates the .dat content using the dat_key provided by the Worker
local function DeobfuscateDat(raw, dat_key)
    -- Scheme: XOR byte-by-byte with cyclic dat_key, then base64-decode
    -- (actual implementation uses util.Base64Decode + XOR loop)
    local decoded = util.Base64Decode(raw)
    local key_len = #dat_key
    local result  = {}
    for i = 1, #decoded do
        result[i] = string.char(bit.bxor(
            string.byte(decoded, i),
            string.byte(dat_key, ((i - 1) % key_len) + 1)
        ))
    end
    return table.concat(result)
end

-- Loads server_id and api_key from gmodpanel.dat using a dat_key
-- dat_key can come from memory (first boot) or from the Worker (restart)
local function LoadIdentityWithKey(dat_key)
    if not file.Exists("gmodpanel.dat", "DATA") then return false end
    local raw = file.Read("gmodpanel.dat", "DATA")
    if not raw then return false end
    local plain = DeobfuscateDat(raw, dat_key)
    local data  = util.JSONToTable(plain)
    if not data or not data.server_id or not data.api_key then
        GModPanel.Error("gmodpanel.dat corrupt or dat_key incorrect")
        return false
    end
    Identity.server_id = data.server_id
    Identity.api_key   = data.api_key
    return true
end

-- Public entry point: fetches dat_key from the Worker, then loads Identity
function GModPanel.LoadIdentity(callback)
    -- server_id is stored in plaintext at the start of the .dat to allow this request
    if not file.Exists("gmodpanel.dat", "DATA") then
        callback(false); return
    end
    local header_raw = file.Read("gmodpanel.dat", "DATA")
    local header = util.JSONToTable(util.Base64Decode(header_raw):sub(1, 64)) -- public section
    if not header or not header.server_id then callback(false); return end

    FetchDatKey(header.server_id, function(dat_key)
        local ok = LoadIdentityWithKey(dat_key)
        callback(ok)
    end)
end
```

```lua
-- sv_auth.lua (continued)
function GModPanel.Handshake(callback)
    -- Identity is local to this file; never exposed externally
    local payload = util.TableToJSON({
        server_id = Identity.server_id,
        api_key   = Identity.api_key,
        timestamp = os.time(),
    })

    http.Post(
        GModPanel.Config.api_base .. "/api/v1/handshake",
        payload,
        function(body, size, headers, code)
            if code ~= 200 then
                GModPanel.Error("Handshake failed: HTTP ", code)
                return
            end

            local res = util.JSONToTable(body)
            if not res or not res.session_token then
                GModPanel.Error("Handshake: invalid response")
                return
            end

            GModPanel.Session.token      = res.session_token
            GModPanel.Session.expires_at = os.time() + res.expires_in

            GModPanel.Print("Session established.")
            if callback then callback() end
        end,
        function(err)
            GModPanel.Error("Handshake error: ", tostring(err))
        end,
        { ["Content-Type"] = "application/json" }
    )
end

-- Proactive renewal: re-handshake 60s before expiry
timer.Create("GModPanel_SessionRenew", 30, 0, function()
    if GModPanel.Session.token and os.time() >= GModPanel.Session.expires_at - 60 then
        GModPanel.Warn("Session expiring soon, renewing...")
        GModPanel.Handshake()
    end
end)

-- Helper used by all outbound requests
-- ONLY function allowed to read Identity; external access is blocked
function GModPanel.AuthHeaders()
    return {
        ["Content-Type"]     = "application/json",
        ["X-Server-ID"]      = Identity.server_id,      -- local to sv_auth.lua
        ["X-Session-Token"]  = GModPanel.Session.token or "",
    }
end

-- Called before sending any request; re-handshakes if token is missing or expired
function GModPanel.EnsureSession(callback)
    if not GModPanel.Session.token or os.time() >= GModPanel.Session.expires_at then
        GModPanel.Handshake(callback)
    else
        callback()
    end
end
```

### 5.8 Heartbeat payload

```lua
-- sv_heartbeat.lua
local function BuildPayload()
    local players = {}
    for _, ply in ipairs(player.GetAll()) do
        table.insert(players, {
            steamid  = ply:SteamID64(),
            name     = ply:Nick(),
            ping     = ply:Ping(),
            team     = team.GetName(ply:Team()),
            playtime = math.floor(ply:TimeConnected()),
        })
    end

    return util.TableToJSON({
        timestamp    = os.time(),
        map          = game.GetMap(),
        gamemode     = engine.ActiveGamemode(),
        player_count = #player.GetAll(),
        max_players  = game.MaxPlayers(),
        fps          = math.floor(1 / engine.TickInterval()),
        players      = players,
    })
end

local function DoHeartbeat()
    local payload = BuildPayload()
    http.Post(
        GModPanel.Config.api_base .. "/api/v1/heartbeat",
        payload,
        function(body, size, headers, code)
            if code == 401 then
                -- Session was invalidated server-side; re-handshake immediately
                GModPanel.Session.token = nil
                GModPanel.Handshake()
                return
            end
            GModPanel.ProcessCommands(util.JSONToTable(body))
        end,
        nil,
        GModPanel.AuthHeaders()
    )
end

timer.Create("GModPanel_Heartbeat", GModPanel.Config.heartbeat, 0, function()
    GModPanel.EnsureSession(DoHeartbeat)
end)
```

### 5.9 Event hooks

```lua
-- sv_events.lua
local function SendEvent(event_type, data)
    data.event = event_type
    data.ts    = os.time()
    data.map   = game.GetMap()
    local payload = util.TableToJSON(data)
    GModPanel.EnsureSession(function()
        http.Post(
            GModPanel.Config.api_base .. "/api/v1/event",
            payload,
            nil, nil,
            GModPanel.AuthHeaders()
        )
    end)
end

hook.Add("PlayerInitialSpawn", "GModPanel_Join", function(ply)
    SendEvent("player_join", { steamid = ply:SteamID64(), name = ply:Nick() })
end)

hook.Add("PlayerDisconnected", "GModPanel_Leave", function(ply)
    SendEvent("player_leave", { steamid = ply:SteamID64(), name = ply:Nick() })
end)

hook.Add("PlayerDeath", "GModPanel_Kill", function(victim, inflictor, attacker)
    SendEvent("player_death", {
        victim   = { id = victim:SteamID64(),   name = victim:Nick()   },
        attacker = IsValid(attacker) and attacker:IsPlayer()
                   and { id = attacker:SteamID64(), name = attacker:Nick() } or nil,
        weapon   = IsValid(inflictor) and inflictor:GetClass() or "world",
    })
end)

hook.Add("PlayerSay", "GModPanel_Chat", function(ply, text)
    SendEvent("player_chat", { steamid = ply:SteamID64(), name = ply:Nick(), message = text })
end)

-- ... more hooks: map change, entity spawn, ULX admin events, etc.
```

### 5.10 Command executor

Commands are declared with the declarative `GModPanel.NewExecutor()` API. Each executor defines its description, required/optional arguments, and a handler. The system automatically validates arguments before calling the handler, and registers the command in the internal `handlers` table.

```lua
-- sv_commands.lua
local handlers = {}  -- { [type] = executor }

-- ────────────────────────────────────────────────────────
-- Declarative executor API
-- ────────────────────────────────────────────────────────
local Executor = {}
Executor.__index = Executor

function GModPanel.NewExecutor(cmd_type)
    local self = setmetatable({}, Executor)
    self._type        = cmd_type
    self._description = ""
    self._args        = {}  -- { { name, required } }
    self._handler     = nil
    return self
end

function Executor:SetDescription(desc)
    self._description = desc
    return self
end

-- required = true  → the Worker validates the field exists before sending
-- required = false → optional field (nil if absent in the payload)
function Executor:AddArgument(name, required)
    table.insert(self._args, { name = name, required = required == true })
    return self
end

function Executor:SetHandler(fn)
    self._handler = fn
    return self
end

function Executor:Register()
    if not self._type then
        GModPanel.Error("Executor has no type — use GModPanel.NewExecutor(\"type\")")
        return
    end
    handlers[self._type] = self
    GModPanel.Print("Executor registered: ", self._type)
end

function Executor:Execute(payload)
    -- Validate required arguments
    for _, arg in ipairs(self._args) do
        if arg.required and payload[arg.name] == nil then
            GModPanel.Warn("Executor '", self._type, "': missing required argument '", arg.name, "'")
            return false
        end
    end
    local ok, err = pcall(self._handler, payload)
    if not ok then
        GModPanel.Error("Executor '", self._type, "' error: ", tostring(err))
    end
    return ok, err
end

-- ────────────────────────────────────────────────────────
-- Command declarations
-- ────────────────────────────────────────────────────────

local KickCommand = GModPanel.NewExecutor("kick")
KickCommand:SetDescription("Kick a player from the server")
KickCommand:AddArgument("steamid", true)
KickCommand:AddArgument("reason")
KickCommand:SetHandler(function(payload)
    local ply = GModPanel.FindPlayer(payload.steamid)
    if IsValid(ply) then
        ply:Kick(payload.reason or "Kicked by admin")
    end
end)
KickCommand:Register()

local BanCommand = GModPanel.NewExecutor("ban")
BanCommand:SetDescription("Ban a player (duration in minutes, 0 = permanent)")
BanCommand:AddArgument("steamid", true)
BanCommand:AddArgument("reason")
BanCommand:AddArgument("duration")
BanCommand:SetHandler(function(payload)
    game.ConsoleCommand(string.format(
        "banid %d %s\n", payload.duration or 0, payload.steamid
    ))
end)
BanCommand:Register()

local WarnCommand = GModPanel.NewExecutor("warn")
WarnCommand:SetDescription("Issue an in-game warning to a player")
WarnCommand:AddArgument("steamid", true)
WarnCommand:AddArgument("reason")
WarnCommand:SetHandler(function(payload)
    local ply = GModPanel.FindPlayer(payload.steamid)
    if IsValid(ply) then
        ply:ChatPrint("[GModPanel] Warning: " .. (payload.reason or ""))
    end
end)
WarnCommand:Register()

local RconCommand = GModPanel.NewExecutor("rcon")
RconCommand:SetDescription("Execute a raw console command (opt-in only)")
RconCommand:AddArgument("cmd", true)
RconCommand:SetHandler(function(payload)
    if GModPanel.Config.allow_rcon then
        game.ConsoleCommand(payload.cmd .. "\n")
    end
end)
RconCommand:Register()

-- ────────────────────────────────────────────────────────
-- Command processing (commands received from the Worker)
-- ────────────────────────────────────────────────────────
function GModPanel.ProcessCommands(list)
    if not list or not list.commands then return end
    local ack_ids = {}

    for _, cmd in ipairs(list.commands) do
        local executor = handlers[cmd.type]
        local ok, err
        if executor then
            ok, err = executor:Execute(cmd.payload)
        else
            GModPanel.Warn("Unknown command: ", tostring(cmd.type))
            ok, err = false, "unknown command type"
        end
        table.insert(ack_ids, { id = cmd.id, ok = ok, error = err })
    end

    if #ack_ids > 0 then
        GModPanel.EnsureSession(function()
            http.Post(
                GModPanel.Config.api_base .. "/api/v1/command/ack",
                util.TableToJSON({ acks = ack_ids }),
                nil, nil,
                GModPanel.AuthHeaders()
            )
        end)
    end
end
```

---

## 6. Authentication — Steam OpenID

Server owners log in with their Steam account. No passwords.

### Flow

```
1. User clicks "Login with Steam"
2. Dashboard redirects → Worker /auth/steam/redirect
3. Worker redirects → Steam OpenID endpoint
4. Steam redirects back → /auth/steam/callback?openid.*=...
5. Worker verifies the Steam assertion (HTTP back-channel to steamcommunity.com)
6. Worker fetches Steam profile via Steam Web API (avatar, name, steamid64)
7. Worker creates/upserts user in D1
8. Worker issues signed JWT (stored in HttpOnly cookie)
9. Dashboard receives session, renders home
```

### Session token (KV)

```
Key:   session:{token}
Value: { user_id, steamid64, expires_at }
TTL:   7 days
```

Tokens are random 32-byte hex strings. The JWT payload only contains the `token`; the real data lives in KV so sessions can be revoked instantly.

---

## 7. API Design

All routes are prefixed `/api/v1`. Server-facing routes authenticate via `X-Server-ID` + `X-Session-Token`. Dashboard-facing routes authenticate via session cookie.

### Server-facing endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/setup/code` | Get ephemeral setup_code (anonymous, no credentials) |
| `GET` | `/api/v1/setup/poll` | Poll until linking is confirmed (`?code=XXXX-XXXX`) |
| `GET` | `/api/v1/setup/datkey` | Fetch dat_key to de-obfuscate gmodpanel.dat on restart |
| `POST` | `/api/v1/handshake` | Establish session; returns ephemeral `session_token` |
| `POST` | `/api/v1/heartbeat` | Receive state snapshot; return command queue |
| `POST` | `/api/v1/event` | Receive a single game event |
| `POST` | `/api/v1/command/ack` | Acknowledge executed commands |

### Dashboard-facing endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/servers` | List all servers owned by the user |
| `POST` | `/api/v1/servers` | Register a new server (returns server_id + api_key) |
| `GET` | `/api/v1/servers/:id/live` | Current live state from KV |
| `GET` | `/api/v1/servers/:id/players` | Current player list |
| `GET` | `/api/v1/servers/:id/stats/players` | Player count over time |
| `GET` | `/api/v1/servers/:id/stats/maps` | Play time per map |
| `GET` | `/api/v1/servers/:id/stats/performance` | FPS / tickrate over time |
| `GET` | `/api/v1/servers/:id/events` | Paginated event log |
| `POST` | `/api/v1/servers/:id/commands` | Enqueue a command |
| `GET` | `/api/v1/servers/:id/warnings` | List warnings for server |
| `POST` | `/api/v1/servers/:id/warnings` | Issue a warning |
| `GET` | `/api/v1/players/:steamid` | Player profile + history |
| `GET` | `/api/v1/players/:steamid/warnings` | Player warnings |

### Auth endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/steam/redirect` | Initiate Steam OpenID flow |
| `GET` | `/auth/steam/callback` | Receive and verify Steam assertion |
| `POST` | `/auth/logout` | Invalidate session in KV |

---

## 8. Command & Control System

### Enqueueing a command (dashboard → Worker)

```json
POST /api/v1/servers/srv_abc/commands
{
  "type": "kick",
  "payload": {
    "steamid": "76561198000000000",
    "reason": "Cheating"
  }
}
```

The Worker:
1. Validates the session and server ownership.
2. Generates a `cmd_id` (UUID v4).
3. Writes to KV: `cmd:srv_abc:{cmd_id}` → `{ type, payload, status: "pending", created_at }` with TTL 10 minutes.
4. Appends `cmd_id` to a queue list: `cmdqueue:srv_abc` → `[..., cmd_id]`.
5. Writes to D1 for audit log.

### Delivering commands (Worker → GMod)

On every `POST /api/v1/heartbeat`, the Worker:
1. Reads `cmdqueue:srv_abc` from KV.
2. Fetches each command's data.
3. Returns them in the heartbeat response body.
4. Sets each command status to `"delivered"` in KV.

If the server crashes before acknowledging, commands with status `"delivered"` older than 2 minutes are reset to `"pending"` on the next heartbeat (dead-letter recovery).

### Available command types

| Type | Payload fields | Description |
|---|---|---|
| `kick` | `steamid`, `reason` | Kick player from server |
| `ban` | `steamid`, `reason`, `duration` (minutes, 0 = permanent) | Ban player |
| `unban` | `steamid` | Remove ban |
| `warn` | `steamid`, `reason` | Issue an in-game warning |
| `mute` | `steamid`, `duration` | Mute player in voice/text |
| `goto` | `steamid` (admin steamid), `target` (steamid) | Teleport admin to player |
| `spectate` | `steamid` | Force spectate mode |
| `rcon` | `cmd` | Raw console command (optional, disabled by default) |
| `message` | `text` | Broadcast message to all players |
| `map_change` | `map` | Change server map |

---

## 9. Statistics & Analytics

### 9.1 Collected metrics

Every heartbeat writes a row to `server_snapshots` in D1:

```
timestamp, server_id, map, gamemode, player_count, max_players, fps, tickrate
```

Every event writes a row to `server_events`:

```
timestamp, server_id, event_type, data (JSON)
```

### 9.2 Aggregated views

Pre-aggregated queries are run by a scheduled Worker (Cron Trigger, e.g. every hour) and their results are cached in KV so the dashboard reads are fast.

| Metric | Aggregation | KV key | TTL |
|---|---|---|---|
| Players per hour (last 24h) | GROUP BY hour | `stat:srv:{id}:pph:24h` | 1h |
| Players per day (last 30d) | GROUP BY day | `stat:srv:{id}:ppd:30d` | 6h |
| Top maps (last 7d) | GROUP BY map | `stat:srv:{id}:maps:7d` | 6h |
| Avg FPS per day (last 7d) | AVG(fps) GROUP BY day | `stat:srv:{id}:fps:7d` | 6h |
| Peak concurrent ever | MAX | `stat:srv:{id}:peak` | permanent |
| Unique players (last 30d) | COUNT DISTINCT steamid | `stat:srv:{id}:unique:30d` | 6h |

### 9.3 Per-player analytics

```
player_sessions table:
  steamid, server_id, joined_at, left_at, map, playtime_seconds

player_kills table:
  timestamp, server_id, killer_steamid, victim_steamid, weapon, map
```

From these, the dashboard can show per-player: total playtime, session history, kill/death ratio, most-played maps, and full activity timeline.

---

## 10. Warning System

### D1 table

```sql
CREATE TABLE warnings (
    id          TEXT PRIMARY KEY,
    server_id   TEXT NOT NULL,
    steamid     TEXT NOT NULL,
    issued_by   TEXT NOT NULL,   -- admin steamid64
    reason      TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER,         -- NULL = permanent
    active      INTEGER DEFAULT 1
);
```

### Warning flow

1. Admin clicks "Warn" on the dashboard (or issues `/warn` via in-game command, which the addon relays via event).
2. Worker creates warning in D1, queues an in-game `warn` command.
3. GMod receives the command on next heartbeat and notifies the player in chat.
4. If the server has auto-escalation configured (e.g. 3 warnings → auto-kick, 5 → ban), the Worker evaluates the threshold on each new warning and auto-enqueues the corresponding command.

### Auto-escalation config (per server)

```json
{
  "escalation": [
    { "threshold": 3, "action": "kick",  "reason": "Too many warnings" },
    { "threshold": 5, "action": "ban",   "duration": 1440, "reason": "Auto-ban: 5 warnings" }
  ]
}
```

Stored in KV: `config:srv:{id}:escalation`

---

## 11. Dashboard Frontend

The frontend is a SPA compiled to `./app/dist/`. **No Cloudflare Pages, no R2.** The Worker serves static files directly: any route that is not `/api/*` or `/auth/*` returns the `index.html` or the corresponding asset from `./app/dist/`.

### Pages

| Route | Description |
|---|---|
| `/` | Server list / overview |
| `/servers/:id` | Server home — live status, map, player count |
| `/servers/:id/players` | Live player list with action buttons |
| `/servers/:id/stats` | Charts: players over time, map breakdown, performance |
| `/servers/:id/events` | Real-time event log (via Durable Object WebSocket) |
| `/servers/:id/commands` | Command history and manual command form |
| `/servers/:id/warnings` | Warning list, issue warning form |
| `/players/:steamid` | Player profile: sessions, warnings, kill history |
| `/settings` | Account settings, add/remove servers, regenerate API keys |

### Live view (WebSocket via Durable Object)

The dashboard opens a WebSocket to `/api/v1/servers/:id/ws`. The Durable Object for that server broadcasts a message whenever:
- A new event is received from the GMod server.
- The heartbeat updates player count or map.

This powers the real-time event feed and live player counter without polling.

---

## 12. Database Schema (D1) & Migrations

### 12.0 Migration management

Migrations live in `./migrations/` and are applied with `wrangler d1 migrations apply`.

```
gmod-panel/
└── migrations/
    ├── 0001_initial.sql          # users, servers
    ├── 0002_snapshots_events.sql # server_snapshots, server_events
    ├── 0003_players.sql          # player_sessions, player_kills
    ├── 0004_warnings.sql         # warnings
    └── 0005_command_log.sql      # command_log
```

**Conventions:**
- Name: `{sequential_number}_{description}.sql` (4 digits, always incrementing).
- Each file is idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- NEVER modify an already-applied migration — create a new one instead (`ALTER TABLE ...`).
- For development: `wrangler d1 migrations apply gmodpanel --local`.
- For production: `wrangler d1 migrations apply gmodpanel`.

```json
// wrangler.jsonc — D1 binding
{
    "d1_databases": [
        {
            "binding": "DB",
            "database_name": "gmodpanel",
            "database_id": "<uuid>",
            "migrations_dir": "migrations"
        }
    ]
}
```

### 12.1 Full schema

```sql
-- Users
CREATE TABLE users (
    id          TEXT PRIMARY KEY,   -- ulid
    steamid64   TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url  TEXT,
    created_at  INTEGER NOT NULL,
    last_login  INTEGER
);

-- Servers
CREATE TABLE servers (
    id          TEXT PRIMARY KEY,   -- "srv_" + nanoid
    owner_id    TEXT NOT NULL REFERENCES users(id),
    name        TEXT NOT NULL,
    description TEXT,
    created_at  INTEGER NOT NULL,
    last_seen   INTEGER,
    active      INTEGER DEFAULT 1
);

-- Periodic state snapshots (from heartbeats)
CREATE TABLE server_snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id    TEXT NOT NULL,
    ts           INTEGER NOT NULL,
    map          TEXT,
    gamemode     TEXT,
    player_count INTEGER,
    max_players  INTEGER,
    fps          REAL,
    tickrate     REAL
);
CREATE INDEX idx_snapshots_server_ts ON server_snapshots(server_id, ts);

-- Game events
CREATE TABLE server_events (
    id        TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    ts        INTEGER NOT NULL,
    type      TEXT NOT NULL,   -- player_join, player_leave, player_death, player_chat, map_change, ...
    data      TEXT             -- JSON blob
);
CREATE INDEX idx_events_server_ts ON server_events(server_id, ts);

-- Player sessions
CREATE TABLE player_sessions (
    id          TEXT PRIMARY KEY,
    server_id   TEXT NOT NULL,
    steamid64   TEXT NOT NULL,
    player_name TEXT,
    joined_at   INTEGER NOT NULL,
    left_at     INTEGER,
    map         TEXT
);
CREATE INDEX idx_sessions_steamid ON player_sessions(steamid64);

-- Kill feed
CREATE TABLE player_kills (
    id             TEXT PRIMARY KEY,
    server_id      TEXT NOT NULL,
    ts             INTEGER NOT NULL,
    killer_steamid TEXT,
    victim_steamid TEXT NOT NULL,
    weapon         TEXT,
    map            TEXT
);

-- Warnings
CREATE TABLE warnings (
    id         TEXT PRIMARY KEY,
    server_id  TEXT NOT NULL,
    steamid    TEXT NOT NULL,
    issued_by  TEXT NOT NULL,
    reason     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    active     INTEGER DEFAULT 1
);
CREATE INDEX idx_warnings_steamid ON warnings(steamid, server_id);

-- Command audit log
CREATE TABLE command_log (
    id         TEXT PRIMARY KEY,
    server_id  TEXT NOT NULL,
    type       TEXT NOT NULL,
    payload    TEXT,
    issued_by  TEXT,           -- dashboard user steamid
    status     TEXT,           -- pending | delivered | acked | failed
    created_at INTEGER NOT NULL,
    acked_at   INTEGER
);
```

---

## 13. KV Schema

| Key pattern | Value | TTL |
|---|---|---|
| `setup:{code}` | `{ pending: true }` or `{ server_id, api_key }` after linking | 10 min |
| `session:{token}` | `{ user_id, steamid64, expires_at }` | 7 days (dashboard) |
| `session:{server_id}:{token}` | `{ server_id, issued_at }` | 2h (server session) |
| `handshake:{server_id}` | `{ session_token }` — tracks current active session | 2h |
| `live:{server_id}` | Full live state JSON (map, players, fps, ...) | 2× heartbeat interval |
| `cmdqueue:{server_id}` | JSON array of pending cmd IDs | none (managed explicitly) |
| `cmd:{server_id}:{cmd_id}` | `{ type, payload, status, created_at }` | 10 min |
| `config:{server_id}:escalation` | Escalation rules JSON | none |
| `stat:{server_id}:pph:24h` | Hourly player counts JSON | 1h |
| `stat:{server_id}:ppd:30d` | Daily player counts JSON | 6h |
| `stat:{server_id}:maps:7d` | Map breakdown JSON | 6h |
| `stat:{server_id}:fps:7d` | Daily avg FPS JSON | 6h |
| `ratelimit:{server_id}:{minute}` | Request count | 90s |

---

## 14. Durable Objects

### `ServerHub` (one per registered server)

Manages WebSocket connections from dashboard clients. When the heartbeat Worker receives new data or an event comes in, it calls `ServerHub.broadcast(msg)` via a stub.

```typescript
export class ServerHub implements DurableObject {
    private sessions: Set<WebSocket> = new Set();

    async fetch(request: Request): Promise<Response> {
        if (request.headers.get("Upgrade") === "websocket") {
            const [client, server] = Object.values(new WebSocketPair());
            server.accept();
            this.sessions.add(server);
            server.addEventListener("close", () => this.sessions.delete(server));
            return new Response(null, { status: 101, webSocket: client });
        }

        // Internal broadcast call from heartbeat/event Workers
        if (request.method === "POST" && new URL(request.url).pathname === "/broadcast") {
            const msg = await request.text();
            this.sessions.forEach(ws => ws.send(msg));
            return new Response("ok");
        }

        return new Response("Not found", { status: 404 });
    }
}
```

---

## 15. Security Model

### Server identity & session handshake

Every GMod server has a unique `server_id` and a permanent `api_key` (32-byte random hex, stored hashed in D1). The `api_key` is **only used once** — during the initial handshake. All subsequent requests authenticate with an ephemeral `session_token` issued by the Worker.

#### Handshake (Worker side)

```typescript
// POST /api/v1/handshake
app.post("/api/v1/handshake", async (c) => {
    const { server_id, api_key, timestamp } = await c.req.json();

    // Replay prevention: reject if timestamp is more than 30s old
    if (Math.abs(Date.now() / 1000 - timestamp) > 30) {
        return c.json({ error: "Request expired" }, 401);
    }

    // Verify api_key against stored hash
    const server = await c.env.DB
        .prepare("SELECT api_key_hash FROM servers WHERE id = ?")
        .bind(server_id).first();
    if (!server || !await verifyHash(api_key, server.api_key_hash)) {
        return c.json({ error: "Invalid credentials" }, 401);
    }

    // Detect duplicate session (another instance already connected)
    const existing = await c.env.KV.get(`handshake:${server_id}`);
    if (existing) {
        // Invalidate old session before issuing new one
        const { session_token: old_token } = JSON.parse(existing);
        await c.env.KV.delete(`session:${server_id}:${old_token}`);
    }

    // Issue ephemeral session token (TTL = 2 hours)
    const session_token = crypto.randomUUID().replace(/-/g, "");
    const expires_in    = 7200;
    await c.env.KV.put(
        `session:${server_id}:${session_token}`,
        JSON.stringify({ server_id, issued_at: Date.now() }),
        { expirationTtl: expires_in }
    );
    // Track current session per server for duplicate detection
    await c.env.KV.put(
        `handshake:${server_id}`,
        JSON.stringify({ session_token }),
        { expirationTtl: expires_in }
    );

    return c.json({ session_token, expires_in });
});
```

#### Request verification (middleware)

All server-facing routes (heartbeat, event, command/ack) run through this middleware:

```typescript
async function verifyServerSession(c: Context, next: Next) {
    const server_id     = c.req.header("X-Server-ID");
    const session_token = c.req.header("X-Session-Token");

    if (!server_id || !session_token) {
        return c.json({ error: "Missing auth headers" }, 401);
    }

    const session = await c.env.KV.get(`session:${server_id}:${session_token}`);
    if (!session) {
        // Token not found or expired — tell the addon to re-handshake
        return c.json({ error: "Session expired", rehandshake: true }, 401);
    }

    c.set("server_id", server_id);
    await next();
}
```

The addon handles `401 + rehandshake: true` by calling `GModPanel.Handshake()` before retrying the request (see `sv_auth.lua` in section 5).

### Dashboard session security

- Sessions stored in HttpOnly, Secure, SameSite=Strict cookies.
- Session data lives in KV, never in the cookie itself.
- Steam OpenID assertion verified server-side via back-channel HTTP.

### Rate limiting

KV-based sliding window per `server_id` per minute. Exceeding the limit returns `429` and does not process the payload, preventing amplification attacks from a compromised server.

### Ownership enforcement

Every dashboard API route verifies that the authenticated user owns (or is a co-admin of) the requested `server_id` before reading or writing any data.

---

## 16. Roadmap

### Phase 1 — Core (MVP)

- [ ] Worker skeleton with Hono routing
- [ ] D1 schema migrations
- [ ] Steam OpenID auth flow
- [ ] Server registration + API key issuance
- [ ] Heartbeat ingestion + KV live state
- [ ] Event ingestion (join/leave/death/chat)
- [ ] Kick + ban commands
- [ ] Basic dashboard (server list, live player list)
- [ ] GMod addon: heartbeat + events + command executor

### Phase 2 — Analytics

- [ ] Scheduled Worker for stat aggregation
- [ ] Player count over time chart
- [ ] Map playtime breakdown
- [ ] FPS / tickrate performance graph
- [ ] Per-player session history

### Phase 3 — Moderation

- [ ] Warning system (issue, list, auto-escalation)
- [ ] Mute command
- [ ] Player profile page (full history across all servers)
- [ ] Admin activity log (who issued which command, when)

### Phase 4 — Real-time & UX

- [ ] Durable Object WebSocket hub
- [ ] Live event feed in dashboard
- [ ] Live player counter updates
- [ ] Multi-admin support (server owner invites co-admins)
- [ ] Discord webhook notifications on configurable events

### Phase 5 — Advanced

- [ ] ULX / SAM / Evolved integration bridges (sync existing ban/warn databases)
- [ ] RCON passthrough (optional, explicit opt-in by server owner)
- [ ] Public server stats page (shareable URL)
- [ ] Map thumbnail previews
- [ ] Mobile-friendly dashboard PWA

---

*GModPanel — built on Cloudflare Workers · Hono · D1 · KV · Durable Objects*
