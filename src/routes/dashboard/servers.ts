// =========================================================================
// src/routes/dashboard/servers.ts
// Dashboard-facing server management routes:
//   GET/POST /api/v1/servers
//   GET      /api/v1/servers/:id/live
//   GET      /api/v1/servers/:id/players
//   POST     /api/v1/servers/:id/commands
//   GET      /api/v1/servers/:id/ws  (WebSocket via Durable Object)
//   GET/PUT  /api/v1/servers/:id/config
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
			"SELECT id, name, display_name, description, created_at, last_seen, active FROM servers WHERE owner_id = ?"
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

/** Helper: check if user is the owner of the server */
async function assertOwnerOnly(
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

/** Helper: check if user owns OR is an accepted member of the server */
async function assertAccess(
	c: AppContext,
	server_id: string
): Promise<boolean> {
	const user_id = c.get("user_id")!;
	const steamid64 = c.get("steamid64")!;

	// Owner check
	const ownerRow = await c.env.DB
		.prepare("SELECT id FROM servers WHERE id = ? AND owner_id = ?")
		.bind(server_id, user_id)
		.first();
	if (ownerRow) return true;

	// Accepted member check
	const memberRow = await c.env.DB
		.prepare("SELECT 1 FROM server_members WHERE server_id = ? AND steamid64 = ? AND status = 'accepted'")
		.bind(server_id, steamid64)
		.first();
	return !!memberRow;
}

/** GET /api/v1/servers/:id/live — current live state from KV */
app.get("/:id/live", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertAccess(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const state = await getLiveState(c.env.KV, server_id);
	return c.json({ live: state, online: state !== null });
});

/** GET /api/v1/servers/:id/players — current player list from KV live state */
app.get("/:id/players", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertAccess(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const state = await getLiveState(c.env.KV, server_id);
	return c.json({ players: state?.players ?? [], online: state !== null });
});

/** GET /api/v1/servers/:id/events — paginated event log from D1 */
app.get("/:id/events", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertAccess(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 200);
	const before = c.req.query("before"); // unix-seconds cursor
	const typeFilter = c.req.query("type");  // optional event type filter

	let query = "SELECT id, ts, type, data FROM server_events WHERE server_id = ?";
	const binds: (string | number)[] = [server_id];

	if (typeFilter) {
		query += " AND type = ?";
		binds.push(typeFilter);
	}
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

	// Also return distinct types for the filter dropdown
	const { results: typeRows } = await c.env.DB
		.prepare("SELECT DISTINCT type FROM server_events WHERE server_id = ? ORDER BY type ASC")
		.bind(server_id)
		.all<{ type: string }>();

	return c.json({ events: results, types: typeRows.map(r => r.type), has_more: results.length === limit });
});

/** POST /api/v1/servers/:id/commands — enqueue a command */
app.post("/:id/commands", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertAccess(c, server_id))) {
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
	if (!(await assertAccess(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 200);
	const { results } = await c.env.DB
		.prepare(
			`SELECT cl.id, cl.type, cl.payload, cl.issued_by, cl.status, cl.created_at, cl.acked_at,
			        u.display_name AS issued_by_name
			 FROM command_log cl
			 LEFT JOIN users u ON u.steamid64 = cl.issued_by
			 WHERE cl.server_id = ? ORDER BY cl.created_at DESC LIMIT ?`
		)
		.bind(server_id, limit)
		.all();

	return c.json({ commands: results });
});

/** GET /api/v1/servers/:id/ws — proxy WebSocket to Durable Object */
app.get("/:id/ws", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertAccess(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	if (c.req.header("Upgrade") !== "websocket") {
		return c.json({ error: "Expected WebSocket upgrade" }, 426);
	}

	const stub = c.env.SERVER_HUB.get(c.env.SERVER_HUB.idFromName(server_id));
	return stub.fetch(c.req.raw);
});

/** DELETE /api/v1/servers/:id — completely delete a server and its data */
app.delete("/:id", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnerOnly(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	await c.env.DB
		.prepare("DELETE FROM servers WHERE id = ?")
		.bind(server_id)
		.run();

	await c.env.KV.delete(`live:${server_id}`);
	await c.env.KV.delete(`datkey:${server_id}`);

	return c.json({ ok: true });
});

/** GET /api/v1/servers/:id/registry — command executor definitions from D1 */
app.get("/:id/registry", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertAccess(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const { results } = await c.env.DB
		.prepare("SELECT type, description, args FROM command_registry WHERE server_id = ? ORDER BY type ASC")
		.bind(server_id)
		.all();

	// Parse args JSON column back into objects
	const registry = results.map((row: any) => ({
		type: row.type as string,
		description: row.description as string,
		args: JSON.parse((row.args as string) || "[]") as unknown[],
	}));

	return c.json({ registry });
});

/** GET /api/v1/servers/:id/config — current config from D1 */
app.get("/:id/config", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertAccess(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const row = await c.env.DB
		.prepare("SELECT * FROM server_config WHERE server_id = ?")
		.bind(server_id)
		.first();

	return c.json({ config: row ?? null });
});

// =========================================================================
// Config field list — the subset of server_config columns that are
// writable by the dashboard and accepted as server_config commands.
// =========================================================================

const CONFIG_FIELDS = [
	"server_name",
	"map",
	"gamemode",
	"max_players",
	"region",
	"sv_password",
	"friendlyfire",
	// Sandbox
	"sbox_godmode",
	"sbox_noclip",
	"sbox_weapons",
	"sbox_playershurtplayers",
	"sbox_bonemanip_misc",
	"sbox_bonemanip_npc",
	"sbox_bonemanip_player",
	"sbox_maxprops",
	"sbox_maxragdolls",
	"sbox_maxnpcs",
	"sbox_maxvehicles",
	"sbox_maxeffects",
	"sbox_maxballoons",
	"sbox_maxbuttons",
	"sbox_maxcameras",
	"sbox_maxconstraints",
	"sbox_maxdynamite",
	"sbox_maxemitters",
	"sbox_maxhoverballs",
	"sbox_maxlamps",
	"sbox_maxlights",
	"sbox_maxropeconstraints",
	"sbox_maxsents",
	"sbox_maxthrusters",
	"sbox_maxwheels",
] as const;


type ConfigField = (typeof CONFIG_FIELDS)[number];
type ConfigPayload = Partial<Record<ConfigField, string | number | boolean | null>>;

/** PUT /api/v1/servers/:id/config — update config and enqueue commands */
app.put("/:id/config", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertAccess(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	let body: ConfigPayload;
	try {
		body = await c.req.json<ConfigPayload>();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const issued_by = c.get("steamid64")!;
	const now = Date.now();
	const queued: string[] = [];

	// Fetch existing config row to detect what actually changed
	const existing = (await c.env.DB
		.prepare("SELECT * FROM server_config WHERE server_id = ?")
		.bind(server_id)
		.first()) as Record<string, unknown> | null;

	// Collect only the fields present in the request body
	const columns: string[] = ["server_id", "updated_at"];
	const values: (string | number | boolean | null)[] = [server_id, now];


	for (const field of CONFIG_FIELDS) {
		if (!(field in body)) continue;
		const value = body[field] ?? null;
		columns.push(field);
		values.push(value as string | number | null);

		// Enqueue a command only when the value actually changed
		const prev = existing ? (existing[field] ?? null) : null;
		if (String(prev) !== String(value)) {
			const cmd_id = await enqueueCommand(
				c.env.KV,
				c.env.DB,
				server_id,
				"server_config",
				{ field, value },
				issued_by
			);
			queued.push(cmd_id);
		}
	}

	// Build the ON CONFLICT update clause using `excluded.*` (SQLite standard)
	const updateClauses = columns
		.filter((col) => col !== "server_id")
		.map((col) => `${col} = excluded.${col}`)
		.join(", ");

	await c.env.DB
		.prepare(
			`INSERT INTO server_config (${columns.join(", ")})
			 VALUES (${columns.map(() => "?").join(", ")})
			 ON CONFLICT(server_id) DO UPDATE SET ${updateClauses}`
		)
		.bind(...values)
		.run();

	return c.json({ ok: true, queued });
}); 

// =========================================================================
// PATCH /api/v1/servers/:id — update server display name (dashboard label)
// =========================================================================

app.patch("/:id", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnerOnly(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	let body: { display_name?: string };
	try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

	const name = (body.display_name ?? "").trim();
	if (!name) return c.json({ error: "display_name is required" }, 400);
	if (name.length > 64) return c.json({ error: "Name too long (max 64 chars)" }, 400);

	await c.env.DB
		.prepare("UPDATE servers SET display_name = ? WHERE id = ?")
		.bind(name, server_id)
		.run();

	return c.json({ ok: true, display_name: name });
});

// =========================================================================
// Member endpoints (invite / list / remove)
// =========================================================================

/** GET /api/v1/servers/:id/members — list all members + pending invites */
app.get("/:id/members", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertAccess(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const { results } = await c.env.DB
		.prepare(
			`SELECT sm.steamid64, sm.role, sm.status, sm.invited_by, sm.created_at, sm.accepted_at,
			        u.display_name, u.avatar_url
			 FROM server_members sm
			 LEFT JOIN users u ON u.steamid64 = sm.steamid64
			 WHERE sm.server_id = ?
			 ORDER BY sm.created_at ASC`
		)
		.bind(server_id)
		.all();

	// Also fetch owner info
	const owner = await c.env.DB
		.prepare(
			`SELECT u.steamid64, u.display_name, u.avatar_url
			 FROM servers s JOIN users u ON u.id = s.owner_id
			 WHERE s.id = ?`
		)
		.bind(server_id)
		.first();

	return c.json({ owner, members: results });
});

/** POST /api/v1/servers/:id/members — invite by steamid64 or Steam profile URL */
app.post("/:id/members", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnerOnly(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}

	let body: { input?: string };
	try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

	const raw = (body.input ?? "").trim();
	if (!raw) return c.json({ error: "input is required" }, 400);

	// Resolve SteamID64 from the input
	let steamid64: string | null = null;
	const STEAM_API = "https://api.steampowered.com";

	// Already a 17-digit SteamID64?
	if (/^\d{17}$/.test(raw)) {
		steamid64 = raw;
	}
	// Direct profile URL: steamcommunity.com/profiles/76561XXXXXXXXX
	else if (/steamcommunity\.com\/profiles\/(\d{17})/.test(raw)) {
		steamid64 = raw.match(/profiles\/(\d{17})/)![1];
	}
	// Vanity URL: steamcommunity.com/id/USERNAME — resolve via API
	else {
		const vanityMatch = raw.match(/steamcommunity\.com\/id\/([^/]+)/);
		const vanity = vanityMatch ? vanityMatch[1] : raw;
		try {
			const res = await fetch(
				`${STEAM_API}/ISteamUser/ResolveVanityURL/v1/?key=${c.env.STEAM_API_KEY}&vanityurl=${encodeURIComponent(vanity)}`
			);
			const data = await res.json<{ response: { success: number; steamid?: string } }>();
			if (data.response.success === 1) steamid64 = data.response.steamid!;
		} catch { /* ignore */ }
	}

	if (!steamid64) return c.json({ error: "Could not resolve a SteamID64 from the input provided" }, 400);

	// Can't invite yourself
	const ownerSteamid = c.get("steamid64")!;
	if (steamid64 === ownerSteamid) return c.json({ error: "You cannot invite yourself" }, 400);

	// Already a member?
	const existing = await c.env.DB
		.prepare("SELECT status FROM server_members WHERE server_id = ? AND steamid64 = ?")
		.bind(server_id, steamid64)
		.first<{ status: string }>();

	if (existing) {
		if (existing.status === "accepted") return c.json({ error: "This user is already a member" }, 409);
		if (existing.status === "pending") return c.json({ error: "This user already has a pending invitation" }, 409);
		// Declined — allow re-invite by resetting status
		await c.env.DB
			.prepare("UPDATE server_members SET status = 'pending', invited_by = ?, created_at = ? WHERE server_id = ? AND steamid64 = ?")
			.bind(ownerSteamid, Date.now(), server_id, steamid64)
			.run();
	} else {
		await c.env.DB
			.prepare(
				`INSERT INTO server_members (server_id, steamid64, role, invited_by, status, created_at)
				 VALUES (?, ?, 'member', ?, 'pending', ?)`
			)
			.bind(server_id, steamid64, ownerSteamid, Date.now())
			.run();
	}

	// Try to fetch the profile name for the response
	let display_name = steamid64;
	let avatar_url: string | null = null;
	try {
		const pr = await fetch(
			`${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/?key=${c.env.STEAM_API_KEY}&steamids=${steamid64}`
		);
		const pd = await pr.json<{ response: { players: Array<{ personaname: string; avatarfull: string }> } }>();
		const player = pd.response.players[0];
		if (player) { display_name = player.personaname; avatar_url = player.avatarfull; }
	} catch { /* non-critical */ }

	return c.json({ ok: true, steamid64, display_name, avatar_url });
});

/** DELETE /api/v1/servers/:id/members/:steamid — remove or revoke invitation */
app.delete("/:id/members/:steamid", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnerOnly(c, server_id))) {
		return c.json({ error: "Forbidden" }, 403);
	}
	const steamid64 = c.req.param("steamid");
	await c.env.DB
		.prepare("DELETE FROM server_members WHERE server_id = ? AND steamid64 = ?")
		.bind(server_id, steamid64)
		.run();
	return c.json({ ok: true });
});

/** POST /api/v1/servers/:id/members/respond — accept or decline an invitation */
app.post("/:id/members/respond", async (c) => {
	const server_id = c.req.param("id");
	const steamid64 = c.get("steamid64")!;

	let body: { action: "accept" | "decline" };
	try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
	if (!["accept", "decline"].includes(body.action)) {
		return c.json({ error: "action must be 'accept' or 'decline'" }, 400);
	}

	const row = await c.env.DB
		.prepare("SELECT 1 FROM server_members WHERE server_id = ? AND steamid64 = ? AND status = 'pending'")
		.bind(server_id, steamid64)
		.first();
	if (!row) return c.json({ error: "No pending invitation found" }, 404);

	if (body.action === "accept") {
		await c.env.DB
			.prepare("UPDATE server_members SET status = 'accepted', accepted_at = ? WHERE server_id = ? AND steamid64 = ?")
			.bind(Date.now(), server_id, steamid64)
			.run();
	} else {
		await c.env.DB
			.prepare("UPDATE server_members SET status = 'declined' WHERE server_id = ? AND steamid64 = ?")
			.bind(server_id, steamid64)
			.run();
	}

	return c.json({ ok: true });
});

export default app;

