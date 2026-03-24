-- =============================================================================
-- migrations/0005_command_log.sql
-- Audit log for all commands issued from the dashboard.
-- =============================================================================

CREATE TABLE IF NOT EXISTS command_log (
    id         TEXT    PRIMARY KEY,      -- ulid
    server_id  TEXT    NOT NULL,
    type       TEXT    NOT NULL,
    payload    TEXT,                     -- JSON blob
    issued_by  TEXT,                     -- dashboard user steamid64
    status     TEXT    NOT NULL DEFAULT 'pending', -- pending | delivered | acked | failed
    created_at INTEGER NOT NULL,
    acked_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cmdlog_server ON command_log(server_id, created_at);
