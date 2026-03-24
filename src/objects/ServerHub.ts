// =========================================================================
// src/objects/ServerHub.ts
// Durable Object: one instance per server. Manages WebSocket connections
// from dashboard clients and broadcasts live updates from the Worker.
// =========================================================================

// =========================================================================
// Imports
// =========================================================================



// =========================================================================
// Class
// =========================================================================

export class ServerHub implements DurableObject {
	private sessions: Set<WebSocket> = new Set();

	constructor(
		private readonly state: DurableObjectState,
		private readonly env: Env
	) {}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// WebSocket upgrade — dashboard client connecting for live updates
		if (request.headers.get("Upgrade") === "websocket") {
			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

			server.accept();
			this.sessions.add(server);

			server.addEventListener("close", () => {
				this.sessions.delete(server);
			});

			server.addEventListener("error", () => {
				this.sessions.delete(server);
			});

			return new Response(null, { status: 101, webSocket: client });
		}

		// Internal broadcast call — from heartbeat/event Worker routes
		if (request.method === "POST" && url.pathname === "/broadcast") {
			const msg = await request.text();
			let delivered = 0;
			for (const ws of this.sessions) {
				try {
					ws.send(msg);
					delivered++;
				} catch {
					this.sessions.delete(ws);
				}
			}
			return Response.json({ ok: true, delivered });
		}

		// Health check
		if (request.method === "GET" && url.pathname === "/health") {
			return Response.json({ sessions: this.sessions.size });
		}

		return new Response("Not found", { status: 404 });
	}
}

