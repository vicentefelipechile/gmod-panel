-- =============================================================================
-- migrations/0008_sandbox_config.sql
-- Adds Sandbox-specific convar columns to server_config.
-- Also drops the motd column (no longer needed).
-- =============================================================================

-- Remove motd (no longer used)
ALTER TABLE server_config DROP COLUMN motd;

-- Sandbox booleans (0/1)
ALTER TABLE server_config ADD COLUMN sbox_godmode          INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_noclip           INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_weapons          INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_playershurtplayers INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_bonemanip_misc   INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_bonemanip_npc    INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_bonemanip_player INTEGER;

-- Sandbox limits (integers)
ALTER TABLE server_config ADD COLUMN sbox_maxprops         INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxragdolls      INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxnpcs          INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxvehicles      INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxeffects       INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxballoons      INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxbuttons       INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxcameras       INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxconstraints   INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxdynamite      INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxemitters      INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxhoverballs    INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxlamps         INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxlights        INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxropeconstraints INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxsents         INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxthrusters     INTEGER;
ALTER TABLE server_config ADD COLUMN sbox_maxwheels        INTEGER;
