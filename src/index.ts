// =========================================================================
// src/index.ts
// GModPanel Worker entry point — Hono app bootstrap with all route mounts.
// Serves /api/v1/* and /auth/* routes; all other routes return the SPA.
// =========================================================================

// =========================================================================
// Imports
// =========================================================================

import { Hono } from "hono";
import { cors } from "hono/cors";

import setupRoutes from "./routes/server/setup";
import handshakeRoute from "./routes/server/handshake";
import heartbeatRoute from "./routes/server/heartbeat";
import eventRoute from "./routes/server/event";
import commandRoute from "./routes/server/command";

import steamRoutes from "./routes/auth/steam";

import serverRoutes from "./routes/dashboard/servers";
import statsRoutes from "./routes/dashboard/stats";
import playerRoutes from "./routes/dashboard/players";
import warningRoutes from "./routes/dashboard/warnings";

import type { HonoVars } from "./types";

export { ServerHub } from "./objects/ServerHub";

// =========================================================================
// App Bootstrap
// =========================================================================

const app = new Hono<{ Bindings: Env; Variables: HonoVars }>();

app.use("*", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

// =========================================================================
// Routes
// =========================================================================

// --- Server-facing ---
app.route("/api/v1/setup", setupRoutes);
app.route("/api/v1/handshake", handshakeRoute);
app.route("/api/v1/heartbeat", heartbeatRoute);
app.route("/api/v1/event", eventRoute);
app.route("/api/v1/command", commandRoute);

// --- Auth ---
app.route("/auth/steam", steamRoutes);

// --- Dashboard ---
app.route("/api/v1/servers", serverRoutes);
app.route("/api/v1/servers", statsRoutes);
app.route("/api/v1/players", playerRoutes);
app.route("/api/v1/servers", warningRoutes);

// =========================================================================
// Export
// =========================================================================

export default app;

