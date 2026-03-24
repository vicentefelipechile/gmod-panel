// =========================================================================
// src/services/commands.ts
// Command queue management: enqueue, deliver, and acknowledge commands.
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import {
	getCmdQueue,
	putCmdQueue,
	getCmd,
	putCmd,
	deleteCmd,
	type CommandRecord,
} from "./kv";
import { genCmdId } from "../utils/id";


// =========================================================================
// Types
// =========================================================================

export interface EnqueuedCommand {
	id: string;
	type: string;
	payload: Record<string, unknown>;
}

// =========================================================================
// Functions
// =========================================================================

/**
 * Adds a new command to the server's KV queue.
 * Returns the generated command ID.
 */
export async function enqueueCommand(
	kv: KVNamespace,
	db: D1Database,
	server_id: string,
	type: string,
	payload: Record<string, unknown>,
	issued_by?: string
): Promise<string> {
	const cmd_id = genCmdId();
	const now = Date.now();

	// Store command record in KV (TTL 10 min)
	const record: CommandRecord = {
		type,
		payload,
		status: "pending",
		created_at: now,
	};
	await putCmd(kv, server_id, cmd_id, record);

	// Append to queue list
	const queue = await getCmdQueue(kv, server_id);
	queue.push(cmd_id);
	await putCmdQueue(kv, server_id, queue);

	// Write to audit log in D1
	await db
		.prepare(
			`INSERT INTO command_log (id, server_id, type, payload, issued_by, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`
		)
		.bind(
			cmd_id,
			server_id,
			type,
			JSON.stringify(payload),
			issued_by ?? null,
			now
		)
		.run();

	return cmd_id;
}

/**
 * Reads all pending commands from KV for a server.
 * Marks them as "delivered" and returns them.
 * Resets stale "delivered" commands (crash recovery).
 */
export async function deliverCommands(
	kv: KVNamespace,
	server_id: string
): Promise<EnqueuedCommand[]> {
	const queue = await getCmdQueue(kv, server_id);
	if (queue.length === 0) return [];

	const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
	const toDeliver: EnqueuedCommand[] = [];
	const remaining: string[] = [];

	for (const cmd_id of queue) {
		const record = await getCmd(kv, server_id, cmd_id);
		if (!record) continue; // expired or already deleted

		// Dead-letter recovery: reset stale delivered commands back to pending
		if (
			record.status === "delivered" &&
			record.created_at < twoMinutesAgo
		) {
			record.status = "pending";
		}

		if (record.status === "pending") {
			record.status = "delivered";
			await putCmd(kv, server_id, cmd_id, record);
			toDeliver.push({ id: cmd_id, type: record.type, payload: record.payload });
		}

		remaining.push(cmd_id);
	}

	await putCmdQueue(kv, server_id, remaining);
	return toDeliver;
}

/**
 * Acknowledge a list of executed commands.
 * Each ack contains { id, ok, error? }.
 */
export async function ackCommands(
	kv: KVNamespace,
	db: D1Database,
	server_id: string,
	acks: Array<{ id: string; ok: boolean; error?: string }>
): Promise<void> {
	const now = Date.now();

	for (const ack of acks) {
		const status = ack.ok ? "acked" : "failed";

		// Remove from KV (let it expire naturally if missing)
		const record = await getCmd(kv, server_id, ack.id);
		if (record) {
			record.status = status;
			await putCmd(kv, server_id, ack.id, record);
		}

		// Update queue — remove acked/failed
		const queue = await getCmdQueue(kv, server_id);
		const updated = queue.filter((id) => id !== ack.id);
		await putCmdQueue(kv, server_id, updated);

		// Update D1 audit log
		await db
			.prepare(
				`UPDATE command_log SET status = ?, acked_at = ? WHERE id = ? AND server_id = ?`
			)
			.bind(status, now, ack.id, server_id)
			.run();
	}
}

