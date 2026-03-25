// =========================================================================
// src/routes/server/setup.ts
// GET /api/v1/setup/code    — generate ephemeral setup code (anonymous)
// GET /api/v1/setup/poll    — poll until linking confirmed
// GET /api/v1/setup/datkey  — fetch dat_key to decrypt gmodpanel.dat
// POST /api/v1/setup/confirm — dashboard confirms linking with setup code
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import { Hono } from "hono";
import {
	getSetup,
	putSetupPending,
	putSetupReady,
} from "../../services/kv";
import { genSetupCode, randomHex, genServerId } from "../../utils/id";
import { hashApiKey } from "../../utils/hash";
import { verifyDashboardSession } from "../../middleware/verifyDashboardSession";
import type { HonoVars } from "../../types";

// =========================================================================
// Handler
// =========================================================================

const app = new Hono<{ Bindings: Env; Variables: HonoVars }>();

/**
 * GET /api/v1/setup/code
 * Anonymous. Generates a new setup_code + dat_key, stores in KV, returns to the addon.
 */
app.get("/code", async (c) => {
	const code = genSetupCode();
	const dat_key = randomHex(32);

	await putSetupPending(c.env.KV, code, dat_key);

	const workerUrl = c.env.WORKER_URL ?? "https://gmodpanel.vicentefelipechile.workers.dev";

	return c.json({
		setup_code: code,
		dat_key,
		expires_in: 600,
		setup_url: `${workerUrl}/setup?code=${code}`,
	});
});

/**
 * GET /api/v1/setup/poll?code=XXXX-XXXX
 * Addon polls every 5 seconds. Returns 202 while waiting, 200 when ready.
 */
app.get("/poll", async (c) => {
	const code = c.req.query("code");
	if (!code) return c.json({ error: "Missing code" }, 400);

	const setup = await getSetup(c.env.KV, code);
	if (!setup) return c.json({ error: "Invalid or expired code" }, 404);

	if (setup.pending) {
		return c.json({ status: "waiting" }, 202);
	}

	// Ready: return credentials to addon
	return c.json({
		status: "ready",
		server_id: setup.server_id,
		api_key: setup.api_key,
	});
});

/**
 * GET /api/v1/setup/datkey?server_id=srv_...
 * Called by the addon on restart to retrieve the dat_key from the Worker,
 * which allows it to decrypt gmodpanel.dat.
 *
 * Security: The Worker re-issues the dat_key only after verifying that
 * the server_id exists and is active. The dat_key is the stored one.
 *
 * NOTE: This endpoint is intentionally simple for the MVP. A hardened
 * version would require a signed challenge-response.
 */
app.get("/datkey", async (c) => {
	const server_id = c.req.query("server_id");
	if (!server_id) return c.json({ error: "Missing server_id" }, 400);

	const server = await c.env.DB
		.prepare("SELECT id FROM servers WHERE id = ? AND active = 1")
		.bind(server_id)
		.first();

	if (!server) return c.json({ error: "Server not found" }, 404);

	// Retrieve the stored dat_key from KV: datkey:{server_id}
	const dat_key = await c.env.KV.get(`datkey:${server_id}`);
	if (!dat_key) return c.json({ error: "dat_key not available" }, 404);

	return c.json({ dat_key });
});

/**
 * POST /api/v1/setup/confirm
 * Called by the dashboard UI when the superadmin enters the setup_code.
 * Requires a valid dashboard session (handled at route mount level).
 * Creates the server record in D1 and writes credentials back to KV.
 */
app.use("/confirm", verifyDashboardSession);
app.post("/confirm", async (c) => {
	const body = await c.req.json<{ code: string; name: string }>();
	if (!body.code || !body.name) {
		return c.json({ error: "Missing code or name" }, 400);
	}

	const setup = await getSetup(c.env.KV, body.code);
	if (!setup) return c.json({ error: "Invalid or expired code" }, 404);
	if (!setup.pending) return c.json({ error: "Already linked" }, 409);

	const user_id = c.get("user_id");
	const server_id = genServerId();
	const api_key = randomHex(32);
	const api_key_hash = await hashApiKey(api_key);
	const dat_key = setup.dat_key;
	const now = Date.now();

	console.log(server_id, user_id, body.name, api_key_hash, now);

	// Persist server
	await c.env.DB
		.prepare(
			`INSERT INTO servers (id, owner_id, name, api_key_hash, created_at, active)
       VALUES (?, ?, ?, ?, ?, 1)`
		)
		.bind(server_id, user_id, body.name, api_key_hash, now)
		.run();

	// Store dat_key for future restarts
	await c.env.KV.put(`datkey:${server_id}`, dat_key);

	// Mark setup as ready so the addon's poll call returns credentials
	await putSetupReady(c.env.KV, body.code, server_id, api_key);

	return c.json({ ok: true, server_id });
});

export default app;

