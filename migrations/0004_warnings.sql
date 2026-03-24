-- =============================================================================
-- migrations/0004_warnings.sql
-- Player warning records.
-- =============================================================================

CREATE TABLE IF NOT EXISTS warnings (
    id         TEXT    PRIMARY KEY,      -- ulid
    server_id  TEXT    NOT NULL,
    steamid    TEXT    NOT NULL,
    issued_by  TEXT    NOT NULL,         -- admin steamid64
    reason     TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,                  -- NULL = permanent
    active     INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_warnings_steamid ON warnings(steamid, server_id);
CREATE INDEX IF NOT EXISTS idx_warnings_server  ON warnings(server_id, created_at);
