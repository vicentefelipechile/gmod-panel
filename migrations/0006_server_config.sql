-- =========================================================================
-- 0006_server_config.sql
-- Stores the remote configuration state for each registered server.
-- =========================================================================

CREATE TABLE IF NOT EXISTS server_config (
    server_id    TEXT    PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
    server_name  TEXT,
    map          TEXT,
    gamemode     TEXT,
    max_players  INTEGER,
    region       TEXT,
    sv_password  TEXT,
    friendlyfire INTEGER DEFAULT 0,
    motd         TEXT,
    updated_at   INTEGER
);
