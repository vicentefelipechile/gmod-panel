// =========================================================================
// src/middleware/verifyServerSession.ts
// Middleware that validates X-Server-ID + X-Session-Token against KV.
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import type { Context, Next } from "hono";
import { getServerSession } from "../services/kv";
import { checkRateLimit } from "../services/kv";
import type { HonoVars } from "../types";

// =========================================================================
// Middleware
// =========================================================================

export async function verifyServerSession(
	c: Context<{ Bindings: Env; Variables: HonoVars }>,
	next: Next
): Promise<Response | void> {
	const server_id = c.req.header("X-Server-ID");
	const session_token = c.req.header("X-Session-Token");

	if (!server_id || !session_token) {
		return c.json({ error: "Missing auth headers" }, 401);
	}

	// Rate limit: 120 requests per minute per server
	const allowed = await checkRateLimit(c.env.KV, server_id);
	if (!allowed) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}

	const session = await getServerSession(c.env.KV, server_id, session_token);
	if (!session) {
		return c.json({ error: "Session expired", rehandshake: true }, 401);
	}

	c.set("server_id", server_id);
	await next();
}

