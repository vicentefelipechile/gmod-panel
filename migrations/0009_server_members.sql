-- =============================================================================
-- migrations/0009_server_members.sql
-- Server member invitations — allows an owner to grant panel access to others.
-- Also adds display_name to servers so owners can rename in the dashboard.
-- =============================================================================

ALTER TABLE servers ADD COLUMN display_name TEXT;

CREATE TABLE IF NOT EXISTS server_members (
    server_id   TEXT    NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    steamid64   TEXT    NOT NULL,
    role        TEXT    NOT NULL DEFAULT 'member',   -- 'owner' | 'member'
    invited_by  TEXT,                                -- steamid64 of the owner
    status      TEXT    NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'declined'
    created_at  INTEGER NOT NULL,
    accepted_at INTEGER,
    PRIMARY KEY (server_id, steamid64)
);
