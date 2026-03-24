// =========================================================================
// src/routes/dashboard/warnings.ts
// GET  /api/v1/servers/:id/warnings — list warnings for a server
// POST /api/v1/servers/:id/warnings — issue a new warning
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import { Hono, type Context } from "hono";
import { verifyDashboardSession } from "../../middleware/verifyDashboardSession";
import { enqueueCommand } from "../../services/commands";
import { genWarningId } from "../../utils/id";
import { getEscalation } from "../../services/kv";
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

/** Helper — verify ownership */
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

/** GET /api/v1/servers/:id/warnings */
app.get("/:id/warnings", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnership(c, server_id))) return c.json({ error: "Forbidden" }, 403);

	const { results } = await c.env.DB
		.prepare(
			`SELECT id, steamid, issued_by, reason, created_at, expires_at, active
       FROM warnings WHERE server_id = ? ORDER BY created_at DESC LIMIT 100`
		)
		.bind(server_id)
		.all();

	return c.json({ warnings: results });
});

/** POST /api/v1/servers/:id/warnings — issue a warning + queue in-game notification */
app.post("/:id/warnings", async (c) => {
	const server_id = c.req.param("id");
	if (!(await assertOwnership(c, server_id))) return c.json({ error: "Forbidden" }, 403);

	let body: { steamid: string; reason: string; expires_at?: number };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!body.steamid || !body.reason) {
		return c.json({ error: "Missing steamid or reason" }, 400);
	}

	const issued_by = c.get("steamid64")!;
	const warning_id = genWarningId();
	const now = Date.now();

	// Insert warning in D1
	await c.env.DB
		.prepare(
			`INSERT INTO warnings (id, server_id, steamid, issued_by, reason, created_at, expires_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
		)
		.bind(
			warning_id,
			server_id,
			body.steamid,
			issued_by,
			body.reason,
			now,
			body.expires_at ?? null
		)
		.run();

	// Queue in-game warn notification
	await enqueueCommand(
		c.env.KV,
		c.env.DB,
		server_id,
		"warn",
		{ steamid: body.steamid, reason: body.reason },
		issued_by
	);

	// Auto-escalation logic
	const rules = await getEscalation(c.env.KV, server_id);
	if (rules.length > 0) {
		const { results } = await c.env.DB
			.prepare(
				"SELECT COUNT(*) AS count FROM warnings WHERE server_id = ? AND steamid = ? AND active = 1"
			)
			.bind(server_id, body.steamid)
			.all();

		const activeCount = (results[0] as { count: number })?.count ?? 0;

		for (const rule of rules) {
			if (activeCount >= rule.threshold) {
				await enqueueCommand(
					c.env.KV,
					c.env.DB,
					server_id,
					rule.action,
					{
						steamid: body.steamid,
						reason: rule.reason,
						duration: rule.duration ?? 0,
					},
					"system"
				);
				break; // apply only the first matching rule
			}
		}
	}

	return c.json({ ok: true, warning_id });
});

export default app;

