-- =============================================================================
-- migrations/0001_initial.sql
-- Initial schema: users and servers tables.
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,        -- ulid
    steamid64    TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url   TEXT,
    created_at   INTEGER NOT NULL,
    last_login   INTEGER
);

CREATE TABLE IF NOT EXISTS servers (
    id           TEXT PRIMARY KEY,        -- "srv_" + nanoid
    owner_id     TEXT NOT NULL REFERENCES users(id),
    name         TEXT NOT NULL,
    description  TEXT,
    api_key_hash TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    last_seen    INTEGER,
    active       INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner_id);
