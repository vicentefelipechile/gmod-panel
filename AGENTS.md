# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands (`package.json`)

| Command | Purpose |
|---------|---------|
| `npm run dev` / `start` | Local development (backend only, port 8787) |
| `npm run dev:backend` | Start Wrangler Worker (port 8787) |
| `npm run dev:app` | Start Vite SPA (port 5173, proxies to Worker) |
| `npm run build:app` | Compile Vite SPA to `app/dist/` |
| `npm run deploy` | Deploy Worker + static assets to Cloudflare |
| `npm run cf-typegen` | Generate TypeScript types from wrangler.jsonc bindings |
| `npm run test` | Run vitest suite |

Run `npm run cf-typegen` after changing bindings in `wrangler.jsonc`.

## Core Dependencies

- Backend: `hono` (routing), `wrangler` (CLI/dev server).
- Frontend (`app/`): `vite`, `typescript`, `chart.js`, `lucide`.

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

---

# GModPanel — Project Rules

## Architecture

- **Backend**: Cloudflare Worker (`src/`) using Hono. Entry point: `src/index.ts`.
- **Frontend**: Vanilla TypeScript SPA (`app/`) built with Vite. Served directly by the Worker from `./app/dist/`. No Cloudflare Pages, no R2.
- **Database**: D1 (`DB` binding). Migrations in `./migrations/`. Never modify an applied migration — always create a new one.
- **Cache/Queues**: KV (`KV` binding). Live server state, command queues, session tokens.
- **Real-time**: Durable Objects (`SERVER_HUB` binding → `ServerHub` class). One instance per registered server.

## Local Development

Always run TWO terminals concurrently:
```bash
npm run dev:backend   # Wrangler Worker on :8787
npm run dev:app       # Vite SPA on :5173 (proxies /api/* and /auth/* → :8787)
```

Always open the app at `http://localhost:5173` — never directly at `:8787`.

## Bindings (wrangler.jsonc)

| Binding | Type | Purpose |
|---------|------|---------|
| `DB` | D1 | Persistent SQL storage |
| `KV` | KV Namespace | Live state, sessions, command queues |
| `SERVER_HUB` | Durable Object | WebSocket hub per server |
| `WORKER_URL` | var | Base URL (used in Steam OpenID return_to) |
| `STEAM_API_KEY` | secret | Steam Web API (set via `wrangler secret put`) |

## Required Secrets (production)

```bash
npx wrangler secret put STEAM_API_KEY
```

## Code Style

Every file **must** start with a header block:

**TypeScript** (all files in `src/` and `app/`):
```ts
// =========================================================================
// path/to/file.ts — One-line description of what this file does
// =========================================================================
```

Internal sections are also separated by the same style comment bar.

**Lua** (all files in `addon/`):
```lua
--[[--------------------------------------------------------------------
    sv_filename.lua
    One-line description.
--------------------------------------------------------------------]]--
```

Never omit headers, even for small files.

## Auth

- Dashboard auth: Steam OpenID 2.0. Session token in `HttpOnly; SameSite=Strict` cookie. Session data in KV (`session:{token}`), never in the cookie itself.
- Server auth: ephemeral `session_token` issued on handshake (2h TTL in KV). Passed via `X-Session-Token` header. `api_key` is only used once per handshake.
- Middleware: `verifyDashboardSession` for dashboard routes, `verifyServerSession` for server-facing routes.

## API Prefix

All API routes: `/api/v1/...`
Auth routes: `/auth/steam/...`
Everything else: served as SPA static files (`app/dist/index.html`).

## D1 Conventions

- All IDs use `genUserId()` / `randomHex()` from `src/utils/id.ts`.
- Timestamps are Unix milliseconds (`Date.now()`), stored as `INTEGER`.
- Migrations: `{sequential_4digit}_{description}.sql`. Always idempotent (`CREATE TABLE IF NOT EXISTS`).

## KV Key Patterns

| Pattern | Purpose |
|---------|---------|
| `session:{token}` | Dashboard session |
| `session:{server_id}:{token}` | Server session |
| `handshake:{server_id}` | Active session tracking |
| `live:{server_id}` | Live server state JSON |
| `cmdqueue:{server_id}` | Pending command ID list |
| `cmd:{server_id}:{cmd_id}` | Individual command |

## Frontend Rules

- No framework — vanilla TypeScript only.
- Router: `app/router.ts` — History API SPA router. Routes starting with `/auth/` are **not** intercepted (they hit the backend).
- Icons: Lucide (`lucide` npm package). Use `<i data-lucide="icon-name">` in templates. Call `refreshIcons()` after any `innerHTML` update. Register new icons in `app/lib/icons.ts`.
- CSS: modular partials in `app/styles/`, imported via `app/index.css`. Design tokens in `app/styles/variables.css`. No Tailwind.
- After adding new icon names in templates, add them to the `iconMap` in `app/lib/icons.ts`.

## Lua Addon Rules

- `GModPanel.Identity` (server_id + api_key) is **strictly private** to `sv_auth.lua`. Never exposed globally, never logged.
- All console output must go through `GModPanel.Print()`, `GModPanel.Warn()`, or `GModPanel.Error()`. Never use `print()` or `Msg()` directly.
- All outbound HTTP requests must call `GModPanel.EnsureSession(callback)` first, then use `GModPanel.AuthHeaders()` for request headers.
- New commands are registered with `GModPanel.NewExecutor()` in `sv_commands.lua` — never with raw `handlers` table access.
