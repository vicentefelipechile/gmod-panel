--[[--------------------------------------------------------------------
    commands/generic.lua
    Built-in executor definitions. All commands use AddArgMeta() to
    declare fully-typed arguments for the dashboard smart form renderer.
--------------------------------------------------------------------]]--

-- =========================================================================
-- Player actions
-- =========================================================================

GModPanel.NewExecutor("kick")
    :SetDescription("Kick a player from the server")
    :AddArgMeta("steamid", true,  "player",   "Player")
    :AddArgMeta("reason",  false, "reason",   "Reason")
    :SetHandler(function(p)
        local ply = player.GetBySteamID64(p.steamid)
        if IsValid(ply) then
            ply:Kick(p.reason or "Kicked by admin")
        end
    end)
    :Register()

GModPanel.NewExecutor("ban")
    :SetDescription("Ban a player from the server")
    :AddArgMeta("steamid",  true,  "player",   "Player")
    :AddArgMeta("duration", false, "duration", "Duration")
    :AddArgMeta("reason",   false, "reason",   "Reason")
    :SetHandler(function(p)
        RunConsoleCommand("banid", p.duration or 0, p.steamid)
    end)
    :Register()

GModPanel.NewExecutor("unban")
    :SetDescription("Remove a ban by SteamID64")
    :AddArgMeta("steamid", true, "steamid64", "SteamID64")
    :SetHandler(function(p)
        RunConsoleCommand("removeid", p.steamid)
    end)
    :Register()

GModPanel.NewExecutor("warn")
    :SetDescription("Issue an in-game warning to a player")
    :AddArgMeta("steamid", true,  "player", "Player")
    :AddArgMeta("reason",  false, "reason", "Reason")
    :SetHandler(function(p)
        local ply = player.GetBySteamID64(p.steamid)
        if IsValid(ply) then
            ply:ChatPrint("[GModPanel] Warning: " .. (p.reason or ""))
        end
    end)
    :Register()

GModPanel.NewExecutor("mute")
    :SetDescription("Mute a player in voice and text")
    :AddArgMeta("steamid",  true,  "player",   "Player")
    :AddArgMeta("duration", false, "duration", "Duration")
    :SetHandler(function(p)
        local ply = player.GetBySteamID64(p.steamid)
        if not IsValid(ply) then return end

        ply:SetNWBool("GModPanel_Muted", true)
        ply:ChatPrint("[GModPanel] You have been muted.")

        if not (p.duration and p.duration > 0) then return end

        timer.Simple(p.duration * 60, function()
            if IsValid(ply) then
                ply:SetNWBool("GModPanel_Muted", false)
                ply:ChatPrint("[GModPanel] Your mute has expired.")
            end
        end)
    end)
    :Register()

GModPanel.NewExecutor("spectate")
    :SetDescription("Force a player into spectate mode")
    :AddArgMeta("steamid", true, "player", "Player")
    :SetHandler(function(p)
        local ply = player.GetBySteamID64(p.steamid)
        if IsValid(ply) then
            ply:SetTeam(TEAM_SPECTATOR)
        end
    end)
    :Register()

GModPanel.NewExecutor("set_team")
    :SetDescription("Move a player to a specific team")
    :AddArgMeta("steamid", true, "player", "Player")
    :AddArgMeta("team",    true, "team",   "Team")
    :SetHandler(function(p)
        local ply = player.GetBySteamID64(p.steamid)
        if IsValid(ply) then
            ply:SetTeam(tonumber(p.team) or 0)
        end
    end)
    :Register()

GModPanel.NewExecutor("sendto")
    :SetDescription("Teleport a player to another player")
    :AddArgMeta("steamid", true, "player", "Player")
    :AddArgMeta("target",  true, "target", "Target")
    :SetHandler(function(p)
        local admin  = player.GetBySteamID64(p.steamid)
        local target = player.GetBySteamID64(p.target)
        if IsValid(admin) and IsValid(target) then
            admin:SetPos(target:GetPos())
        end
    end)
    :Register()

-- =========================================================================
-- Broadcast
-- =========================================================================

GModPanel.NewExecutor("message")
    :SetDescription("Broadcast a message to all players in chat")
    :AddArgMeta("text", true, "text", "Message")
    :SetHandler(function(p)
        for _, ply in ipairs(player.GetAll()) do
            ply:ChatPrint("[GModPanel] " .. p.text)
        end
    end)
    :Register()

GModPanel.NewExecutor("announce")
    :SetDescription("Show a centered HUD announcement to all players")
    :AddArgMeta("text",     true,  "text",   "Announcement text")
    :AddArgMeta("duration", false, "number", "Duration (seconds)")
    :SetHandler(function(p)
        -- Sends a net message to all clients to display a HUD hint
        net.Start("GModPanel_Announce")
            net.WriteString(tostring(p.text))
            net.WriteInt(tonumber(p.duration) or 5, 8)
        net.Broadcast()
    end)
    :Register()

-- =========================================================================
-- World
-- =========================================================================

GModPanel.NewExecutor("map_change")
    :SetDescription("Change the server map (players stay connected)")
    :AddArgMeta("map", true, "map", "Map")
    :SetHandler(function(p)
        RunConsoleCommand("changelevel", p.map)
    end)
    :Register()

-- =========================================================================
-- Console
-- =========================================================================

GModPanel.NewExecutor("rcon")
    :SetDescription("Execute a raw server console command (requires allow_rcon = true)")
    :AddArgMeta("cmd", true, "command", "Console command")
    :SetHandler(function(p)
        if GModPanel.Config.allow_rcon then
            RunConsoleCommand(unpack(string.Explode(" ", p.cmd, false)))
        else
            GModPanel.Warn("rcon command ignored — allow_rcon is disabled in config.lua")
        end
    end)
    :Register()