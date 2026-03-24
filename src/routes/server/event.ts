// =========================================================================
// src/routes/server/event.ts
// POST /api/v1/event — receives a single game event from the GMod addon,
// writes it to D1, and broadcasts it to the dashboard WebSocket hub.
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import { Hono } from "hono";
import { verifyServerSession } from "../../middleware/verifyServerSession";
import { genEventId, genSessionId } from "../../utils/id";
import type { HonoVars } from "../../types";

// =========================================================================
// Types
// =========================================================================

interface EventBody {
	event: string;
	ts: number;
	map: string;
	[key: string]: unknown;
}

// =========================================================================
// Handler
// =========================================================================

const app = new Hono<{ Bindings: Env; Variables: HonoVars }>();

app.post("/", verifyServerSession, async (c) => {
	const server_id = c.get("server_id")!;

	let body: EventBody;
	try {
		body = await c.req.json<EventBody>();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!body.event || !body.ts) {
		return c.json({ error: "Missing event or ts" }, 400);
	}

	const event_id = genEventId();
	const now = body.ts * 1000; // Lua sends unix seconds

	// Write event to D1 (async)
	c.executionCtx.waitUntil(
		c.env.DB.prepare(
			`INSERT INTO server_events (id, server_id, ts, type, data) VALUES (?, ?, ?, ?, ?)`
		)
			.bind(event_id, server_id, now, body.event, JSON.stringify(body))
			.run()
	);

	// Handle player join/leave for session tracking
	if (body.event === "player_join" && body.steamid) {
		c.executionCtx.waitUntil(
			c.env.DB.prepare(
				`INSERT INTO player_sessions (id, server_id, steamid64, player_name, joined_at, map)
         VALUES (?, ?, ?, ?, ?, ?)`
			)
				.bind(
					genSessionId(),
					server_id,
					body.steamid as string,
					(body.name as string) ?? null,
					now,
					body.map ?? null
				)
				.run()
		);
	}

	if (body.event === "player_leave" && body.steamid) {
		c.executionCtx.waitUntil(
			c.env.DB.prepare(
				`UPDATE player_sessions SET left_at = ?
         WHERE server_id = ? AND steamid64 = ? AND left_at IS NULL
         ORDER BY joined_at DESC LIMIT 1`
			)
				.bind(now, server_id, body.steamid as string)
				.run()
		);
	}

	// Handle kill events
	if (body.event === "player_death") {
		const victim = body.victim as { id?: string } | undefined;
		const attacker = body.attacker as { id?: string } | null | undefined;
		if (victim?.id) {
			c.executionCtx.waitUntil(
				c.env.DB.prepare(
					`INSERT INTO player_kills (id, server_id, ts, killer_steamid, victim_steamid, weapon, map)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
				)
					.bind(
						genEventId(),
						server_id,
						now,
						attacker?.id ?? null,
						victim.id,
						(body.weapon as string) ?? null,
						body.map ?? null
					)
					.run()
			);
		}
	}

	// Broadcast event to Durable Object WebSocket hub
	c.executionCtx.waitUntil(
		(async () => {
			try {
				const stub = c.env.SERVER_HUB.get(
					c.env.SERVER_HUB.idFromName(server_id)
				);
				await stub.fetch("http://do/broadcast", {
					method: "POST",
					body: JSON.stringify({ type: "event", server_id, data: body }),
				});
			} catch {
				// No active dashboard connections — ignore
			}
		})()
	);

	return c.json({ ok: true, event_id });
});

export default app;

