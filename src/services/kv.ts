// =========================================================================
// src/services/kv.ts
// Typed KV helpers for all key patterns used by GModPanel.
// =========================================================================

// =========================================================================
// Imports
// =========================================================================



// =========================================================================
// Types
// =========================================================================

export interface SetupPending {
	pending: true;
	dat_key: string;
}

export interface SetupReady {
	pending: false;
	server_id: string;
	api_key: string;
}

export type SetupValue = SetupPending | SetupReady;

export interface DashboardSession {
	user_id: string;
	steamid64: string;
	expires_at: number;
}

export interface ServerSession {
	server_id: string;
	issued_at: number;
}

export interface HandshakeRecord {
	session_token: string;
}

export interface LiveServerState {
	map: string;
	gamemode: string;
	player_count: number;
	max_players: number;
	fps: number;
	players: Array<{
		steamid: string;
		name: string;
		ping: number;
		team: string;
		playtime: number;
	}>;
	teams: Array<{ index: number; name: string }>;
	maps: string[];
	// Server identity (from live convar values)
	server_name?: string;
	sv_password?: string;
	region?: number;
	friendslyfire?: number;
	ts: number;
}

export interface CommandRecord {
	type: string;
	payload: Record<string, unknown>;
	status: "pending" | "delivered" | "acked" | "failed";
	created_at: number;
}

export interface EscalationRule {
	threshold: number;
	action: "kick" | "ban";
	reason: string;
	duration?: number;
}

// =========================================================================
// Functions
// =========================================================================

// --- Setup ---

export async function getSetup(
	kv: KVNamespace,
	code: string
): Promise<SetupValue | null> {
	const raw = await kv.get(`setup:${code}`);
	return raw ? JSON.parse(raw) : null;
}

export async function putSetupPending(
	kv: KVNamespace,
	code: string,
	dat_key: string
): Promise<void> {
	await kv.put(
		`setup:${code}`,
		JSON.stringify({ pending: true, dat_key }),
		{ expirationTtl: 600 }
	);
}

export async function putSetupReady(
	kv: KVNamespace,
	code: string,
	server_id: string,
	api_key: string
): Promise<void> {
	await kv.put(
		`setup:${code}`,
		JSON.stringify({ pending: false, server_id, api_key }),
		{ expirationTtl: 600 }
	);
}

// --- Dashboard sessions ---

export async function getDashboardSession(
	kv: KVNamespace,
	token: string
): Promise<DashboardSession | null> {
	const raw = await kv.get(`session:${token}`);
	return raw ? JSON.parse(raw) : null;
}

export async function putDashboardSession(
	kv: KVNamespace,
	token: string,
	data: DashboardSession
): Promise<void> {
	await kv.put(`session:${token}`, JSON.stringify(data), {
		expirationTtl: 7 * 24 * 3600,
	});
}

export async function deleteDashboardSession(
	kv: KVNamespace,
	token: string
): Promise<void> {
	await kv.delete(`session:${token}`);
}

// --- Server sessions ---

export async function getServerSession(
	kv: KVNamespace,
	server_id: string,
	token: string
): Promise<ServerSession | null> {
	const raw = await kv.get(`session:${server_id}:${token}`);
	return raw ? JSON.parse(raw) : null;
}

export async function putServerSession(
	kv: KVNamespace,
	server_id: string,
	token: string,
	ttl = 7200
): Promise<void> {
	await kv.put(
		`session:${server_id}:${token}`,
		JSON.stringify({ server_id, issued_at: Date.now() }),
		{ expirationTtl: ttl }
	);
}

export async function getHandshake(
	kv: KVNamespace,
	server_id: string
): Promise<HandshakeRecord | null> {
	const raw = await kv.get(`handshake:${server_id}`);
	return raw ? JSON.parse(raw) : null;
}

export async function putHandshake(
	kv: KVNamespace,
	server_id: string,
	session_token: string,
	ttl = 7200
): Promise<void> {
	await kv.put(
		`handshake:${server_id}`,
		JSON.stringify({ session_token }),
		{ expirationTtl: ttl }
	);
}

// --- Live state ---

export async function getLiveState(
	kv: KVNamespace,
	server_id: string
): Promise<LiveServerState | null> {
	const raw = await kv.get(`live:${server_id}`);
	return raw ? JSON.parse(raw) : null;
}

export async function putLiveState(
	kv: KVNamespace,
	server_id: string,
	state: LiveServerState,
	heartbeat_interval = 30
): Promise<void> {
	await kv.put(`live:${server_id}`, JSON.stringify(state), {
		expirationTtl: heartbeat_interval * 2 + 10,
	});
}

// --- Command queue ---

export async function getCmdQueue(
	kv: KVNamespace,
	server_id: string
): Promise<string[]> {
	const raw = await kv.get(`cmdqueue:${server_id}`);
	return raw ? JSON.parse(raw) : [];
}

export async function putCmdQueue(
	kv: KVNamespace,
	server_id: string,
	queue: string[]
): Promise<void> {
	await kv.put(`cmdqueue:${server_id}`, JSON.stringify(queue));
}

export async function getCmd(
	kv: KVNamespace,
	server_id: string,
	cmd_id: string
): Promise<CommandRecord | null> {
	const raw = await kv.get(`cmd:${server_id}:${cmd_id}`);
	return raw ? JSON.parse(raw) : null;
}

export async function putCmd(
	kv: KVNamespace,
	server_id: string,
	cmd_id: string,
	record: CommandRecord
): Promise<void> {
	await kv.put(`cmd:${server_id}:${cmd_id}`, JSON.stringify(record), {
		expirationTtl: 600,
	});
}

export async function deleteCmd(
	kv: KVNamespace,
	server_id: string,
	cmd_id: string
): Promise<void> {
	await kv.delete(`cmd:${server_id}:${cmd_id}`);
}

// --- Escalation config ---

export async function getEscalation(
	kv: KVNamespace,
	server_id: string
): Promise<EscalationRule[]> {
	const raw = await kv.get(`config:${server_id}:escalation`);
	return raw ? JSON.parse(raw) : [];
}

// --- Rate limiting ---

export async function checkRateLimit(
	kv: KVNamespace,
	server_id: string,
	limitPerMinute = 120
): Promise<boolean> {
	const minute = Math.floor(Date.now() / 60000);
	const key = `ratelimit:${server_id}:${minute}`;
	const raw = await kv.get(key);
	const count = raw ? parseInt(raw, 10) : 0;
	if (count >= limitPerMinute) return false;
	await kv.put(key, String(count + 1), { expirationTtl: 90 });
	return true;
}

