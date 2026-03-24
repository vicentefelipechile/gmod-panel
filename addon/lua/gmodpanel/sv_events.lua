--[[--------------------------------------------------------------------
    sv_events.lua
    Hook registrations for game events. Sends each event to the Worker
    immediately via HTTP (not waiting for the next heartbeat).
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Variables
--------------------------------------------------------------------]]--

-- (none)

--[[--------------------------------------------------------------------
    Functions
--------------------------------------------------------------------]]--

local function SendEvent(event_type, data)
    data.event = event_type
    data.ts    = os.time()
    data.map   = game.GetMap()

    local payload = util.TableToJSON(data)

    GModPanel.EnsureSession(function()
        http.Post(
            GModPanel.Config.api_base .. "/api/v1/event",
            payload,
            function(_, _, _, code)
                if code ~= 200 and GModPanel.Config.debug then
                    GModPanel.Warn("Event '", event_type, "' send failed: HTTP ", tostring(code))
                end
            end,
            function(err)
                if GModPanel.Config.debug then
                    GModPanel.Warn("Event '", event_type, "' error: ", tostring(err))
                end
            end,
            GModPanel.AuthHeaders()
        )
    end)
end

--[[--------------------------------------------------------------------
    Hooks
--------------------------------------------------------------------]]--

hook.Add("PlayerInitialSpawn", "GModPanel_Join", function(ply)
    SendEvent("player_join", {
        steamid = ply:SteamID64(),
        name    = ply:Nick(),
    })
end)

hook.Add("PlayerDisconnected", "GModPanel_Leave", function(ply)
    SendEvent("player_leave", {
        steamid = ply:SteamID64(),
        name    = ply:Nick(),
    })
end)

hook.Add("PlayerDeath", "GModPanel_Death", function(victim, inflictor, attacker)
    SendEvent("player_death", {
        victim   = { id = victim:SteamID64(), name = victim:Nick() },
        attacker = IsValid(attacker) and attacker:IsPlayer()
                   and { id = attacker:SteamID64(), name = attacker:Nick() } or nil,
        weapon   = IsValid(inflictor) and inflictor:GetClass() or "world",
    })
end)

hook.Add("PlayerSay", "GModPanel_Chat", function(ply, text)
    SendEvent("player_chat", {
        steamid = ply:SteamID64(),
        name    = ply:Nick(),
        message = text,
    })
end)

hook.Add("PostGamemodeLoaded", "GModPanel_MapChange", function()
    SendEvent("map_change", { map = game.GetMap() })
end)
