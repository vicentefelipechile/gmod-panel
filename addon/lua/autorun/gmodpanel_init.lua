--[[--------------------------------------------------------------------
    autorun/gmodpanel_init.lua
    GModPanel entry point. Loaded automatically by Garry's Mod on every
    server start. Registers client files, includes all core modules, and
    auto-loads user scripts from gmodpanel/commands/ and gmodpanel/actions/.
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Shared file registration
--------------------------------------------------------------------]]--

AddCSLuaFile("gmodpanel/config.lua")
include("gmodpanel/config.lua")

--[[--------------------------------------------------------------------
    Client file registration
--------------------------------------------------------------------]]--

AddCSLuaFile("gmodpanel/gui/cl_gui.lua")
AddCSLuaFile("gmodpanel/gui/cl_setup.lua")
AddCSLuaFile("gmodpanel/gui/cl_status.lua")

if CLIENT then
    include("gmodpanel/gui/cl_setup.lua")
    include("gmodpanel/gui/cl_status.lua")
    include("gmodpanel/gui/cl_gui.lua")
    return
end

--[[--------------------------------------------------------------------
    Core modules (server-side, order matters)
--------------------------------------------------------------------]]--

include("gmodpanel/sv_core.lua")      -- Print/Warn/Error helpers + boot hook
include("gmodpanel/sv_auth.lua")      -- Identity, Handshake, EnsureSession
include("gmodpanel/sv_setup.lua")     -- First-boot flow
include("gmodpanel/sv_heartbeat.lua") -- Periodic heartbeat timer
include("gmodpanel/sv_events.lua")    -- Game event hooks
include("gmodpanel/sv_netmessages.lua") -- Net message declarations

--[[--------------------------------------------------------------------
    Command executor declarations (core)
--------------------------------------------------------------------]]--

include("gmodpanel/sv_commands.lua")
include("gmodpanel/sv_config.lua")    -- Remote config executor

--[[--------------------------------------------------------------------
    Auto-load user command scripts from gmodpanel/commands/
    Each file can declare additional GModPanel.NewExecutor() blocks.
--------------------------------------------------------------------]]--

local cmd_files = file.Find("gmodpanel/commands/*.lua", "LUA")
for _, fname in ipairs(cmd_files) do
    include("gmodpanel/commands/" .. fname)
    GModPanel.Print("Loaded command script: ", fname)
end

--[[--------------------------------------------------------------------
    Auto-load user action scripts from gmodpanel/actions/
    Each file can register additional event handlers via hook.Add or
    define custom logic triggered from the web dashboard.
--------------------------------------------------------------------]]--

local action_files = file.Find("gmodpanel/actions/*.lua", "LUA")
for _, fname in ipairs(action_files) do
    include("gmodpanel/actions/" .. fname)
    GModPanel.Print("Loaded action script: ", fname)
end
