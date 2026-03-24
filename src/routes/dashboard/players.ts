// =========================================================================
// src/routes/dashboard/players.ts
// GET /api/v1/players/:steamid          — player profile + history
// GET /api/v1/players/:steamid/warnings — player warnings across all servers
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import { Hono } from "hono";
import { verifyDashboardSession } from "../../middleware/verifyDashboardSession";
import type { HonoVars } from "../../types";

// =========================================================================
// Handler
// =========================================================================

const app = new Hono<{ Bindings: Env; Variables: HonoVars }>();

app.use("/*", verifyDashboardSession);

/** GET /api/v1/players/:steamid — player profile + recent sessions + kill stats */
app.get("/:steamid", async (c) => {
	const steamid = c.req.param("steamid");

	// Recent 20 sessions
	const { results: sessions } = await c.env.DB
		.prepare(
			`SELECT server_id, player_name, joined_at, left_at, map
       FROM player_sessions
       WHERE steamid64 = ?
       ORDER BY joined_at DESC
       LIMIT 20`
		)
		.bind(steamid)
		.all();

	// Total playtime in seconds
	const playtime = await c.env.DB
		.prepare(
			`SELECT SUM(left_at - joined_at) / 1000 AS total_seconds
       FROM player_sessions
       WHERE steamid64 = ? AND left_at IS NOT NULL`
		)
		.bind(steamid)
		.first<{ total_seconds: number | null }>();

	// Kill / death counts
	const kills = await c.env.DB
		.prepare(
			"SELECT COUNT(*) AS count FROM player_kills WHERE killer_steamid = ?"
		)
		.bind(steamid)
		.first<{ count: number }>();

	const deaths = await c.env.DB
		.prepare(
			"SELECT COUNT(*) AS count FROM player_kills WHERE victim_steamid = ?"
		)
		.bind(steamid)
		.first<{ count: number }>();

	// Recent 10 kill events
	const { results: kill_feed } = await c.env.DB
		.prepare(
			`SELECT ts, killer_steamid, victim_steamid, weapon, map
       FROM player_kills
       WHERE killer_steamid = ? OR victim_steamid = ?
       ORDER BY ts DESC LIMIT 10`
		)
		.bind(steamid, steamid)
		.all();

	return c.json({
		steamid64: steamid,
		sessions,
		total_playtime_seconds: playtime?.total_seconds ?? 0,
		kills: kills?.count ?? 0,
		deaths: deaths?.count ?? 0,
		recent_kills: kill_feed,
	});
});

/** GET /api/v1/players/:steamid/warnings — all warnings for this player */
app.get("/:steamid/warnings", async (c) => {
	const steamid = c.req.param("steamid");

	const { results } = await c.env.DB
		.prepare(
			`SELECT id, server_id, issued_by, reason, created_at, expires_at, active
       FROM warnings
       WHERE steamid = ?
       ORDER BY created_at DESC`
		)
		.bind(steamid)
		.all();

	return c.json({ warnings: results });
});

export default app;

