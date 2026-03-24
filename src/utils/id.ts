// =========================================================================
// src/utils/id.ts
// Unique ID generation utilities.
// =========================================================================

// =========================================================================
// Functions
// =========================================================================

/** Generate a server ID: "srv_" followed by 12 hex chars */
export function genServerId(): string {
	const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
	return `srv_${rand}`;
}

/** Generate a command ID: "cmd_" followed by UUID hex */
export function genCmdId(): string {
	return `cmd_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Generate a user ID: "usr_" followed by UUID hex */
export function genUserId(): string {
	return `usr_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Generate a warning ID: "wrn_" followed by UUID hex */
export function genWarningId(): string {
	return `wrn_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Generate an event ID: "evt_" followed by UUID hex */
export function genEventId(): string {
	return `evt_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Generate a session ID for players: "ses_" followed by UUID hex */
export function genSessionId(): string {
	return `ses_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Generate a random N-byte hex string */
export function randomHex(bytes = 32): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return Array.from(arr)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Generate a setup code in "XXXX-XXXX" format */
export function genSetupCode(): string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusable chars
	const pick = () =>
		Array.from({ length: 4 }, () =>
			charset[Math.floor(Math.random() * charset.length)]
		).join("");
	return `${pick()}-${pick()}`;
}

