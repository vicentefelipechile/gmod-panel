// =========================================================================
// src/routes/server/config.ts
// GET /api/v1/config — Addon fetches current stored config on startup
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import { Hono } from "hono";
import { verifyServerSession } from "../../middleware/verifyServerSession";
import type { HonoVars } from "../../types";

// =========================================================================
// Handler
// =========================================================================

const app = new Hono<{ Bindings: Env; Variables: HonoVars }>();

/**
 * GET /api/v1/config
 * Called by the GMod addon on startup/restart to retrieve the current
 * stored config so it can restore settings without a heartbeat round-trip.
 */
app.get("/", verifyServerSession, async (c) => {
	const server_id = c.get("server_id")!;

	const row = await c.env.DB
		.prepare("SELECT * FROM server_config WHERE server_id = ?")
		.bind(server_id)
		.first();

	return c.json({ config: row ?? null });
});

export default app;