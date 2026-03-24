-- =============================================================================
-- migrations/0003_players.sql
-- Player session tracking and kill feed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS player_sessions (
    id          TEXT    PRIMARY KEY,     -- ulid
    server_id   TEXT    NOT NULL,
    steamid64   TEXT    NOT NULL,
    player_name TEXT,
    joined_at   INTEGER NOT NULL,
    left_at     INTEGER,
    map         TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_steamid ON player_sessions(steamid64);
CREATE INDEX IF NOT EXISTS idx_sessions_server  ON player_sessions(server_id);

CREATE TABLE IF NOT EXISTS player_kills (
    id             TEXT    PRIMARY KEY,  -- ulid
    server_id      TEXT    NOT NULL,
    ts             INTEGER NOT NULL,
    killer_steamid TEXT,
    victim_steamid TEXT    NOT NULL,
    weapon         TEXT,
    map            TEXT
);

CREATE INDEX IF NOT EXISTS idx_kills_victim  ON player_kills(victim_steamid);
CREATE INDEX IF NOT EXISTS idx_kills_server  ON player_kills(server_id, ts);
