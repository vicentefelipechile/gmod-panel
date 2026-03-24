// =========================================================================
// src/utils/hash.ts
// SHA-256 hashing utilities for API key storage and verification.
// =========================================================================

// =========================================================================
// Functions
// =========================================================================

/**
 * Hash an API key using SHA-256 (Web Crypto API).
 * The result is a hex string, suitable for storing in D1.
 */
export async function hashApiKey(apiKey: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(apiKey);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify a plain API key against a stored SHA-256 hex hash.
 */
export async function verifyHash(
	apiKey: string,
	storedHash: string
): Promise<boolean> {
	const computed = await hashApiKey(apiKey);
	return computed === storedHash;
}

