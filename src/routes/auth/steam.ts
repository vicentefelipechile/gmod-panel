// =========================================================================
// src/routes/auth/steam.ts
// GET  /auth/steam/redirect  — initiates Steam OpenID 2.0 login
// GET  /auth/steam/callback  — verifies Steam assertion, creates session
// POST /auth/logout          — invalidates dashboard session
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import {
	putDashboardSession,
	deleteDashboardSession,
	getDashboardSession,
} from "../../services/kv";
import { genUserId, randomHex } from "../../utils/id";
import type { HonoVars } from "../../types";

// =========================================================================
// Constants
// =========================================================================

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";
const STEAM_API_BASE = "https://api.steampowered.com";
const COOKIE_NAME = "gmp_session";
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

// =========================================================================
// Handler
// =========================================================================

const app = new Hono<{ Bindings: Env; Variables: HonoVars }>();

/**
 * GET /auth/steam/login
 * Builds the OpenID 2.0 redirect URL and sends the user to Steam.
 */
app.get("/login", (c) => {
	const workerUrl = c.env.WORKER_URL;
	const returnTo = `${workerUrl}/auth/steam/callback`;

	const params = new URLSearchParams({
		"openid.ns": "http://specs.openid.net/auth/2.0",
		"openid.mode": "checkid_setup",
		"openid.return_to": returnTo,
		"openid.realm": workerUrl,
		"openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
		"openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
	});

	return c.redirect(`${STEAM_OPENID_URL}?${params.toString()}`);
});

/**
 * GET /auth/steam/callback
 * Receives Steam's redirect after login. Verifies the assertion via
 * back-channel check_authentication request.
 */
app.get("/callback", async (c) => {
	const params = c.req.query();

	// Replay attack: openid.mode must be id_res
	if (params["openid.mode"] !== "id_res") {
		return c.json({ error: "Invalid OpenID mode" }, 400);
	}

	// Build the verification request body
	const verifyParams = new URLSearchParams(params as Record<string, string>);
	verifyParams.set("openid.mode", "check_authentication");

	// Back-channel verification to Steam
	const verifyRes = await fetch(STEAM_OPENID_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: verifyParams.toString(),
	});

	const verifyText = await verifyRes.text();
	if (!verifyText.includes("is_valid:true")) {
		return c.json({ error: "Steam assertion invalid" }, 401);
	}

	// Extract SteamID64 from claimed_id
	// e.g. https://steamcommunity.com/openid/id/76561198000000000
	const claimedId = params["openid.claimed_id"] ?? "";
	const steamid64Match = claimedId.match(/\/id\/(\d+)$/);
	if (!steamid64Match) {
		return c.json({ error: "Could not parse SteamID64" }, 400);
	}
	const steamid64 = steamid64Match[1];

	// Fetch Steam profile via Steam Web API
	let displayName = steamid64;
	let avatarUrl: string | null = null;

	try {
		const profileRes = await fetch(
			`${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${c.env.STEAM_API_KEY}&steamids=${steamid64}`
		);
		const profile = await profileRes.json<{
			response: { players: Array<{ personaname: string; avatarfull: string }> };
		}>();
		const player = profile.response.players[0];
		if (player) {
			displayName = player.personaname;
			avatarUrl = player.avatarfull;
		}
	} catch {
		// Profile fetch is non-critical; proceed without it
	}

	// Upsert user in D1
	const now = Date.now();
	let user = await c.env.DB
		.prepare("SELECT id FROM users WHERE steamid64 = ?")
		.bind(steamid64)
		.first<{ id: string }>();

	if (!user) {
		const user_id = genUserId();
		await c.env.DB
			.prepare(
				`INSERT INTO users (id, steamid64, display_name, avatar_url, created_at, last_login)
         VALUES (?, ?, ?, ?, ?, ?)`
			)
			.bind(user_id, steamid64, displayName, avatarUrl, now, now)
			.run();
		user = { id: user_id };
	} else {
		await c.env.DB
			.prepare(
				"UPDATE users SET display_name = ?, avatar_url = ?, last_login = ? WHERE id = ?"
			)
			.bind(displayName, avatarUrl, now, user.id)
			.run();
	}

	// Issue session token (stored in KV, token in cookie)
	const token = randomHex(32);
	await putDashboardSession(c.env.KV, token, {
		user_id: user.id,
		steamid64,
		expires_at: now + SESSION_TTL_MS,
	});

	const isSecure = c.env.WORKER_URL.startsWith("https://");
	setCookie(c, COOKIE_NAME, token, {
		httpOnly: true,
		secure: isSecure,
		sameSite: isSecure ? "Strict" : "Lax",
		maxAge: 7 * 24 * 3600,
		path: "/",
	});

	return c.redirect("/");
});

/**
 * POST /auth/logout
 * Deletes the session from KV and clears the cookie.
 */
app.post("/logout", async (c) => {
	const token = getCookie(c, COOKIE_NAME);
	if (token) {
		await deleteDashboardSession(c.env.KV, token);
	}
	deleteCookie(c, COOKIE_NAME, { path: "/" });
	return c.json({ ok: true });
});

/**
 * GET /auth/me
 * Returns current user info from the session.
 */
app.get("/me", async (c) => {
	const token = getCookie(c, COOKIE_NAME);
	if (!token) return c.json(null, 401);

	const session = await getDashboardSession(c.env.KV, token);
	if (!session || session.expires_at < Date.now()) return c.json(null, 401);

	const user = await c.env.DB
		.prepare("SELECT id, steamid64, display_name, avatar_url FROM users WHERE id = ?")
		.bind(session.user_id)
		.first<{ id: string; steamid64: string; display_name: string; avatar_url: string | null }>();

	if (!user) return c.json(null, 401);

	// Fetch pending invitations for this user
	const { results: pendingInvitations } = await c.env.DB
		.prepare(
			`SELECT sm.server_id, sm.invited_by, sm.created_at,
			        s.name, s.display_name,
			        u.display_name AS inviter_name, u.avatar_url AS inviter_avatar
			 FROM server_members sm
			 JOIN servers s ON s.id = sm.server_id
			 LEFT JOIN users u ON u.steamid64 = sm.invited_by
			 WHERE sm.steamid64 = ? AND sm.status = 'pending'`
		)
		.bind(user.steamid64)
		.all();

	return c.json({
		user_id: user.id,
		steamid64: user.steamid64,
		display_name: user.display_name,
		avatar_url: user.avatar_url,
		pending_invitations: pendingInvitations,
	});
});

export default app;

