// =========================================================================
// src/middleware/verifyDashboardSession.ts
// Middleware that validates the HttpOnly session cookie against KV.
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { getDashboardSession } from "../services/kv";
import type { HonoVars } from "../types";

// =========================================================================
// Middleware
// =========================================================================

export async function verifyDashboardSession(
	c: Context<{ Bindings: Env; Variables: HonoVars }>,
	next: Next
): Promise<Response | void> {
	const token = getCookie(c, "gmp_session");

	if (!token) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const session = await getDashboardSession(c.env.KV, token);
	if (!session || session.expires_at < Date.now()) {
		return c.json({ error: "Session expired" }, 401);
	}

	c.set("user_id", session.user_id);
	c.set("steamid64", session.steamid64);
	c.set("session_token", token);
	await next();
}

