-- =============================================================================
-- migrations/0007_command_registry.sql
-- Stores the command executor registry reported by the GMod addon.
-- Each row represents one registered executor type for a server.
-- =============================================================================

CREATE TABLE IF NOT EXISTS command_registry (
    server_id   TEXT    NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    type        TEXT    NOT NULL,
    description TEXT,
    args        TEXT,   -- JSON: [{name, type, label, required}]
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (server_id, type)
);

CREATE INDEX IF NOT EXISTS idx_registry_server ON command_registry(server_id);
