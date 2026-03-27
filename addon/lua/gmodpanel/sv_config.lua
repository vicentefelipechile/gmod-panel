--[[--------------------------------------------------------------------
    sv_config.lua
    Remote server configuration executor. Registers the "server_config"
    command type and applies individual setting changes received from
    the Worker command queue.
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Helpers
--------------------------------------------------------------------]]--

local function SetConVarSafe(cvar, value)
    local cv = GetConVar(cvar)
    if not cv then
        GModPanel.Warn("sv_config: unknown cvar '", cvar, "'")
        return false
    end
    RunConsoleCommand(cvar, tostring(value))
    return true
end

-- =========================================================================
-- Field dispatch table
-- Maps config field → apply function(value) → bool, reason
-- =========================================================================

local FIELD_HANDLERS = {

    -- -------------------------------------------------------------------------
    -- Identity
    -- -------------------------------------------------------------------------

    server_name = function(value)
        return SetConVarSafe("hostname", value)
    end,

    region = function(value)
        return SetConVarSafe("sv_region", value)
    end,

    -- -------------------------------------------------------------------------
    -- World
    -- -------------------------------------------------------------------------

    map = function(value)
        RunConsoleCommand("changelevel", tostring(value))
        GModPanel.Print("sv_config: changing map to '", value, "'")
        return true
    end,

    gamemode = function(value)
        return SetConVarSafe("gamemode", value)
    end,

    max_players = function(_value)
        GModPanel.Warn("sv_config: max_players can only be changed at startup via +maxplayers. Skipped.")
        return false, "max_players requires server restart"
    end,

    -- -------------------------------------------------------------------------
    -- Gameplay
    -- -------------------------------------------------------------------------

    friendlyfire = function(value)
        local num = (value == true or value == "true" or value == 1 or value == "1") and 1 or 0
        return SetConVarSafe("mp_friendlyfire", num)
    end,

    -- -------------------------------------------------------------------------
    -- Security
    -- -------------------------------------------------------------------------

    sv_password = function(value)
        return SetConVarSafe("sv_password", value or "")
    end,

    -- -------------------------------------------------------------------------
    -- Quick Actions
    -- -------------------------------------------------------------------------

    run_command = function(value)
        RunConsoleCommand(unpack(string.Explode(" ", tostring(value), false)))
        GModPanel.Print("sv_config: ran console command: ", tostring(value))
        return true
    end,

    restart_map = function(_value)
        local current = game.GetMap()
        RunConsoleCommand("changelevel", current)
        GModPanel.Print("sv_config: restarting map '", current, "'")
        return true
    end,

    clean_entities = function(_value)
        -- Remove all non-player entities spawned by the world
        cleanup.CC_AdminCleanup()
        GModPanel.Print("sv_config: cleaned all non-player entities")
        return true
    end,

    -- -------------------------------------------------------------------------
    -- Sandbox: booleans
    -- -------------------------------------------------------------------------

    sbox_godmode           = function(v) return SetConVarSafe("sbox_godmode",           v == true or v == "true" or v == 1 or v == "1" and 1 or 0) end,
    sbox_noclip            = function(v) return SetConVarSafe("sbox_noclip",            v == true or v == "true" or v == 1 or v == "1" and 1 or 0) end,
    sbox_weapons           = function(v) return SetConVarSafe("sbox_weapons",           v == true or v == "true" or v == 1 or v == "1" and 1 or 0) end,
    sbox_playershurtplayers = function(v) return SetConVarSafe("sbox_playershurtplayers", v == true or v == "true" or v == 1 or v == "1" and 1 or 0) end,
    sbox_bonemanip_misc    = function(v) return SetConVarSafe("sbox_bonemanip_misc",    v == true or v == "true" or v == 1 or v == "1" and 1 or 0) end,
    sbox_bonemanip_npc     = function(v) return SetConVarSafe("sbox_bonemanip_npc",     v == true or v == "true" or v == 1 or v == "1" and 1 or 0) end,
    sbox_bonemanip_player  = function(v) return SetConVarSafe("sbox_bonemanip_player",  v == true or v == "true" or v == 1 or v == "1" and 1 or 0) end,

    -- -------------------------------------------------------------------------
    -- Sandbox: numeric limits
    -- -------------------------------------------------------------------------

    sbox_maxprops          = function(v) return SetConVarSafe("sbox_maxprops",          tonumber(v) or 200) end,
    sbox_maxragdolls       = function(v) return SetConVarSafe("sbox_maxragdolls",       tonumber(v) or 10) end,
    sbox_maxnpcs           = function(v) return SetConVarSafe("sbox_maxnpcs",           tonumber(v) or 10) end,
    sbox_maxvehicles       = function(v) return SetConVarSafe("sbox_maxvehicles",       tonumber(v) or 4) end,
    sbox_maxeffects        = function(v) return SetConVarSafe("sbox_maxeffects",        tonumber(v) or 200) end,
    sbox_maxballoons       = function(v) return SetConVarSafe("sbox_maxballoons",       tonumber(v) or 100) end,
    sbox_maxbuttons        = function(v) return SetConVarSafe("sbox_maxbuttons",        tonumber(v) or 50) end,
    sbox_maxcameras        = function(v) return SetConVarSafe("sbox_maxcameras",        tonumber(v) or 10) end,
    sbox_maxconstraints    = function(v) return SetConVarSafe("sbox_maxconstraints",    tonumber(v) or 2000) end,
    sbox_maxdynamite       = function(v) return SetConVarSafe("sbox_maxdynamite",       tonumber(v) or 10) end,
    sbox_maxemitters       = function(v) return SetConVarSafe("sbox_maxemitters",       tonumber(v) or 20) end,
    sbox_maxhoverballs     = function(v) return SetConVarSafe("sbox_maxhoverballs",     tonumber(v) or 50) end,
    sbox_maxlamps          = function(v) return SetConVarSafe("sbox_maxlamps",          tonumber(v) or 3) end,
    sbox_maxlights         = function(v) return SetConVarSafe("sbox_maxlights",         tonumber(v) or 5) end,
    sbox_maxropeconstraints = function(v) return SetConVarSafe("sbox_maxropeconstraints", tonumber(v) or 1000) end,
    sbox_maxsents          = function(v) return SetConVarSafe("sbox_maxsents",          tonumber(v) or 100) end,
    sbox_maxthrusters      = function(v) return SetConVarSafe("sbox_maxthrusters",      tonumber(v) or 50) end,
    sbox_maxwheels         = function(v) return SetConVarSafe("sbox_maxwheels",         tonumber(v) or 50) end,
}

--[[--------------------------------------------------------------------
    Executor Registration
--------------------------------------------------------------------]]--

GModPanel.NewExecutor("server_config")
    :SetDescription("Apply a remote configuration change to the server")
    :AddArgument("field", true)
    :AddArgument("value", false)
    :SetHandler(function(payload)
        local field   = tostring(payload.field or "")
        local value   = payload.value

        local handler = FIELD_HANDLERS[field]
        if not handler then
            GModPanel.Warn("sv_config: unknown field '", field, "'")
            error("unknown field: " .. field)
        end

        local ok, reason = handler(value)
        if ok == false then
            error(reason or "apply failed")
        end
    end)
    :Register()
