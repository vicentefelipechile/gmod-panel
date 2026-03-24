-- =============================================================================
-- migrations/0002_snapshots_events.sql
-- Server state snapshots (heartbeat rows) and game events.
-- =============================================================================

CREATE TABLE IF NOT EXISTS server_snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id    TEXT    NOT NULL,
    ts           INTEGER NOT NULL,
    map          TEXT,
    gamemode     TEXT,
    player_count INTEGER,
    max_players  INTEGER,
    fps          REAL,
    tickrate     REAL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_server_ts ON server_snapshots(server_id, ts);

CREATE TABLE IF NOT EXISTS server_events (
    id        TEXT    PRIMARY KEY,       -- ulid
    server_id TEXT    NOT NULL,
    ts        INTEGER NOT NULL,
    type      TEXT    NOT NULL,          -- player_join | player_leave | player_death | player_chat | map_change
    data      TEXT                        -- JSON blob
);

CREATE INDEX IF NOT EXISTS idx_events_server_ts ON server_events(server_id, ts);
