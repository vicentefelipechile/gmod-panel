--[[--------------------------------------------------------------------
    config.lua
    General configuration parameters for GModPanel.
    No credentials are stored here — only runtime parameters.
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Config
--------------------------------------------------------------------]]--

GModPanel = GModPanel or {}

GModPanel.Config = {
    api_base   = "http://127.0.0.1:8787",
    heartbeat  = 30,     -- seconds between each heartbeat
    debug      = true,
    allow_rcon = false,  -- explicit opt-in required for rcon command
}

--[[--------------------------------------------------------------------
    Session State
--------------------------------------------------------------------]]--

-- Runtime state — never persisted to disk
GModPanel.Session = {
    token      = nil,  -- ephemeral token received from handshake
    expires_at = 0,
}
