--[[--------------------------------------------------------------------
    Hooks
--------------------------------------------------------------------]]--

hook.Add("PlayerInitialSpawn", "GModPanel_Join", function(ply)
    GModPanel.SendEvent("player_join", {
        steamid = ply:SteamID64(),
        name    = ply:Nick(),
    })
end)

hook.Add("PlayerDisconnected", "GModPanel_Leave", function(ply)
    GModPanel.SendEvent("player_leave", {
        steamid = ply:SteamID64(),
        name    = ply:Nick(),
    })
end)

hook.Add("PlayerDeath", "GModPanel_Death", function(victim, inflictor, attacker)
    GModPanel.SendEvent("player_death", {
        victim   = { id = victim:SteamID64(), name = victim:Nick() },
        attacker = IsValid(attacker) and attacker:IsPlayer()
                   and { id = attacker:SteamID64(), name = attacker:Nick() } or nil,
        weapon   = IsValid(inflictor) and inflictor:GetClass() or "world",
    })
end)

hook.Add("PlayerSay", "GModPanel_Chat", function(ply, text)
    GModPanel.SendEvent("player_chat", {
        steamid = ply:SteamID64(),
        name    = ply:Nick(),
        message = text,
    })
end)

hook.Add("PostGamemodeLoaded", "GModPanel_MapChange", function()
    GModPanel.SendEvent("map_change", { map = game.GetMap() })
end)
