// =========================================================================
// src/routes/dashboard/stats.ts
// GET /api/v1/servers/:id/stats/players     — player count over time
// GET /api/v1/servers/:id/stats/maps        — play time per map
// GET /api/v1/servers/:id/stats/performance — FPS / tickrate over time
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import { Hono, type Context } from "hono";
import { verifyDashboardSession } from "../../middleware/verifyDashboardSession";
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

/** Helper — verify server ownership */
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

/** GET /api/v1/servers/:id/stats/players — hourly player count (last 24h) */
app.get("/:id/stats/players", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnership(c, server_id))) return c.json({ error: "Forbidden" }, 403);

	const since = Date.now() - 24 * 3600 * 1000;
	const { results } = await c.env.DB
		.prepare(
			`SELECT
         (ts / 3600000) * 3600000 AS hour,
         AVG(player_count)        AS avg_players,
         MAX(player_count)        AS max_players
       FROM server_snapshots
       WHERE server_id = ? AND ts >= ?
       GROUP BY hour
       ORDER BY hour ASC`
		)
		.bind(server_id, since)
		.all();

	return c.json({ data: results });
});

/** GET /api/v1/servers/:id/stats/maps — map playtime (last 7d) */
app.get("/:id/stats/maps", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnership(c, server_id))) return c.json({ error: "Forbidden" }, 403);

	const since = Date.now() - 7 * 24 * 3600 * 1000;
	const { results } = await c.env.DB
		.prepare(
			`SELECT
         map,
         COUNT(*) AS snapshot_count
       FROM server_snapshots
       WHERE server_id = ? AND ts >= ? AND map IS NOT NULL
       GROUP BY map
       ORDER BY snapshot_count DESC
       LIMIT 20`
		)
		.bind(server_id, since)
		.all();

	return c.json({ data: results });
});

/** GET /api/v1/servers/:id/stats/performance — FPS over time (last 7d) */
app.get("/:id/stats/performance", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnership(c, server_id))) return c.json({ error: "Forbidden" }, 403);

	const since = Date.now() - 7 * 24 * 3600 * 1000;
	const { results } = await c.env.DB
		.prepare(
			`SELECT
         (ts / 3600000) * 3600000 AS hour,
         AVG(fps)                 AS avg_fps,
         MIN(fps)                 AS min_fps
       FROM server_snapshots
       WHERE server_id = ? AND ts >= ?
       GROUP BY hour
       ORDER BY hour ASC`
		)
		.bind(server_id, since)
		.all();

	return c.json({ data: results });
});

export default app;

