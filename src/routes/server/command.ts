// =========================================================================
// src/routes/server/command.ts
// POST /api/v1/command/ack — acknowledge commands executed by the GMod addon.
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import { Hono } from "hono";
import { verifyServerSession } from "../../middleware/verifyServerSession";
import { ackCommands } from "../../services/commands";
import type { HonoVars } from "../../types";

// =========================================================================
// Types
// =========================================================================

interface AckEntry {
	id: string;
	ok: boolean;
	error?: string;
}

// =========================================================================
// Handler
// =========================================================================

const app = new Hono<{ Bindings: Env; Variables: HonoVars }>();

app.post("/ack", verifyServerSession, async (c) => {
	const server_id = c.get("server_id")!;

	let body: { acks: AckEntry[] };
	try {
		body = await c.req.json<{ acks: AckEntry[] }>();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!Array.isArray(body.acks) || body.acks.length === 0) {
		return c.json({ error: "Missing acks array" }, 400);
	}

	await ackCommands(c.env.KV, c.env.DB, server_id, body.acks);

	return c.json({ ok: true });
});

export default app;

