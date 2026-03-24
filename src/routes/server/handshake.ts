// =========================================================================
// src/routes/server/handshake.ts
// POST /api/v1/handshake — verifies credentials and issues a session token.
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import { Hono } from "hono";
import { verifyHash } from "../../utils/hash";
import { randomHex } from "../../utils/id";
import {
	getHandshake,
	putHandshake,
	putServerSession,
} from "../../services/kv";
import type { HonoVars } from "../../types";

// =========================================================================
// Constants
// =========================================================================

const SESSION_TTL = 7200; // 2 hours

// =========================================================================
// Handler
// =========================================================================

const app = new Hono<{ Bindings: Env; Variables: HonoVars }>();

app.post("/", async (c) => {
	let body: { server_id: string; api_key: string; timestamp: number };

	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const { server_id, api_key, timestamp } = body;

	if (!server_id || !api_key || !timestamp) {
		return c.json({ error: "Missing required fields" }, 400);
	}

	// Replay prevention: reject requests older than 30 seconds
	if (Math.abs(Date.now() / 1000 - timestamp) > 30) {
		return c.json({ error: "Request expired" }, 401);
	}

	// Verify api_key against stored hash in D1
	const server = await c.env.DB
		.prepare("SELECT api_key_hash FROM servers WHERE id = ? AND active = 1")
		.bind(server_id)
		.first<{ api_key_hash: string }>();

	if (!server || !(await verifyHash(api_key, server.api_key_hash))) {
		return c.json({ error: "Invalid credentials" }, 401);
	}

	// Detect and invalidate duplicate session
	const existing = await getHandshake(c.env.KV, server_id);
	if (existing) {
		await c.env.KV.delete(`session:${server_id}:${existing.session_token}`);
	}

	// Issue new ephemeral session token
	const session_token = randomHex(32);
	await putServerSession(c.env.KV, server_id, session_token, SESSION_TTL);
	await putHandshake(c.env.KV, server_id, session_token, SESSION_TTL);

	// Update last_seen in D1
	await c.env.DB
		.prepare("UPDATE servers SET last_seen = ? WHERE id = ?")
		.bind(Date.now(), server_id)
		.run();

	return c.json({ session_token, expires_in: SESSION_TTL });
});

export default app;

