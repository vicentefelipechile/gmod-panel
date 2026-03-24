// =========================================================================
// src/routes/dashboard/servers.ts
// Dashboard-facing server management routes:
//   GET/POST /api/v1/servers
//   GET      /api/v1/servers/:id/live
//   GET      /api/v1/servers/:id/players
//   POST     /api/v1/servers/:id/commands
//   GET      /api/v1/servers/:id/ws  (WebSocket via Durable Object)
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import { Hono, type Context } from "hono";
import { verifyDashboardSession } from "../../middleware/verifyDashboardSession";
import { getLiveState } from "../../services/kv";
import { enqueueCommand } from "../../services/commands";
import type { HonoVars } from "../../types";

// =========================================================================
// Types
// =========================================================================

type AppContext = Context<{ Bindings: Env; Variables: HonoVars }>;

// =========================================================================
// Handler
// =========================================================================

const app = new Hono<{ Bindings: Env; Variables: HonoVars }>();

app.use("/*", verifyDashboardSession);

/** GET /api/v1/servers — list all servers owned by the user */
app.get("/", async (c) => {
	const user_id = c.get("user_id")!;

	const { results } = await c.env.DB
		.prepare(
			"SELECT id, name, description, created_at, last_seen, active FROM servers WHERE owner_id = ?"
		)
		.bind(user_id)
		.all();

	return c.json({ servers: results });
});

/** POST /api/v1/servers — register a new server (returns server_id + api_key) */
// NOTE: Full registration is done via the setup flow (setup/confirm).
// This endpoint exists for manual registration if desired.
app.post("/", async (c) => {
	return c.json(
		{
			error:
				"Use the setup flow: GET /api/v1/setup/code from your GMod addon, then confirm at /setup on the dashboard.",
		},
		405
	);
});

/** Helper: verify the user owns the requested server */
async function assertOwnership(
	c: AppContext,
	server_id: string
): Promise<boolean> {
	const user_id = c.get("user_id")!;
	const row = await c.env.DB
		.prepare("SELECT id FROM servers WHERE id = ? AND owner_id = ?")
		.bind(server_id, user_id)
		.first();
	return !!row;
}

/** GET /api/v1/servers/:id/live — current live state from KV */
app.get("/:id/live", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnership(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const state = await getLiveState(c.env.KV, server_id);
	return c.json({ live: state, online: state !== null });
});

/** GET /api/v1/servers/:id/players — current player list from KV live state */
app.get("/:id/players", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnership(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const state = await getLiveState(c.env.KV, server_id);
	return c.json({ players: state?.players ?? [], online: state !== null });
});

/** GET /api/v1/servers/:id/events — paginated event log from D1 */
app.get("/:id/events", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnership(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 200);
	const before = c.req.query("before"); // ts cursor for pagination

	let query = "SELECT id, ts, type, data FROM server_events WHERE server_id = ?";
	const binds: (string | number)[] = [server_id];

	if (before) {
		query += " AND ts < ?";
		binds.push(parseInt(before, 10));
	}

	query += " ORDER BY ts DESC LIMIT ?";
	binds.push(limit);

	const { results } = await c.env.DB
		.prepare(query)
		.bind(...binds)
		.all();

	return c.json({ events: results });
});

/** POST /api/v1/servers/:id/commands — enqueue a command */
app.post("/:id/commands", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnership(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	let body: { type: string; payload: Record<string, unknown> };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!body.type) {
		return c.json({ error: "Missing type" }, 400);
	}

	const issued_by = c.get("steamid64")!;
	const cmd_id = await enqueueCommand(
		c.env.KV,
		c.env.DB,
		server_id,
		body.type,
		body.payload ?? {},
		issued_by
	);

	return c.json({ ok: true, cmd_id });
});

/** GET /api/v1/servers/:id/commands — command log from D1 */
app.get("/:id/commands", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnership(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 200);
	const { results } = await c.env.DB
		.prepare(
			`SELECT id, type, payload, issued_by, status, created_at, acked_at
       FROM command_log WHERE server_id = ? ORDER BY created_at DESC LIMIT ?`
		)
		.bind(server_id, limit)
		.all();

	return c.json({ commands: results });
});

/** GET /api/v1/servers/:id/ws — proxy WebSocket to Durable Object */
app.get("/:id/ws", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnership(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	if (c.req.header("Upgrade") !== "websocket") {
		return c.json({ error: "Expected WebSocket upgrade" }, 426);
	}

	const stub = c.env.SERVER_HUB.get(c.env.SERVER_HUB.idFromName(server_id));
	return stub.fetch(c.req.raw);
});

export default app;

