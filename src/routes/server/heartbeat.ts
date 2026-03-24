// =========================================================================
// src/routes/server/heartbeat.ts
// POST /api/v1/heartbeat — receives server state snapshot, updates KV
// live state, writes D1 snapshot row, and returns the pending command queue.
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import { Hono } from "hono";
import { putLiveState } from "../../services/kv";
import { deliverCommands } from "../../services/commands";
import { verifyServerSession } from "../../middleware/verifyServerSession";
import type { HonoVars } from "../../types";

// =========================================================================
// Types
// =========================================================================

interface HeartbeatPlayer {
	steamid: string;
	name: string;
	ping: number;
	team: string;
	playtime: number;
}

interface HeartbeatBody {
	timestamp: number;
	map: string;
	gamemode: string;
	player_count: number;
	max_players: number;
	fps: number;
	tickrate?: number;
	players: HeartbeatPlayer[];
}

// =========================================================================
// Handler
// =========================================================================

const app = new Hono<{ Bindings: Env; Variables: HonoVars }>();

app.post("/", verifyServerSession, async (c) => {
	const server_id = c.get("server_id")!;

	let body: HeartbeatBody;
	try {
		body = await c.req.json<HeartbeatBody>();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const now = Date.now();

	// Update KV live state (TTL = 2× heartbeat interval + buffer)
	await putLiveState(c.env.KV, server_id, {
		map: body.map,
		gamemode: body.gamemode,
		player_count: body.player_count,
		max_players: body.max_players,
		fps: body.fps,
		players: body.players,
		ts: now,
	});

	// Write snapshot row to D1 (async — don't await)
	c.executionCtx.waitUntil(
		c.env.DB.prepare(
			`INSERT INTO server_snapshots (server_id, ts, map, gamemode, player_count, max_players, fps, tickrate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(
				server_id,
				now,
				body.map,
				body.gamemode,
				body.player_count,
				body.max_players,
				body.fps,
				body.tickrate ?? null
			)
			.run()
	);

	// Update server last_seen (async)
	c.executionCtx.waitUntil(
		c.env.DB.prepare("UPDATE servers SET last_seen = ? WHERE id = ?")
			.bind(now, server_id)
			.run()
	);

	// Deliver pending commands to the addon
	const commands = await deliverCommands(c.env.KV, server_id);

	// Broadcast live update to Durable Object WebSocket hub
	c.executionCtx.waitUntil(
		(async () => {
			try {
				const stub = c.env.SERVER_HUB.get(
					c.env.SERVER_HUB.idFromName(server_id)
				);
				await stub.fetch("http://do/broadcast", {
					method: "POST",
					body: JSON.stringify({ type: "heartbeat", server_id, data: body }),
				});
			} catch {
				// Hub may not have any active connections — ignore
			}
		})()
	);

	return c.json({ commands });
});

export default app;

