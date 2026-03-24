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
    api_base   = "https://gmodpanel.vicentefelipechile.workers.dev",
    heartbeat  = 30,     -- seconds between each heartbeat
    debug      = false,
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
