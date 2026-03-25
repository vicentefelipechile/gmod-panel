--[[--------------------------------------------------------------------
    Command Declarations
--------------------------------------------------------------------]]--

GModPanel.NewExecutor("kick")
    :SetDescription("Kick a player from the server")
    :AddArgument("steamid", true)
    :AddArgument("reason", false)
    :SetHandler(function(p)
        local ply = player.GetBySteamID64(p.steamid)
        if IsValid(ply) then
            ply:Kick(p.reason or "Kicked by admin")
        end
    end)
    :Register()

GModPanel.NewExecutor("ban")
    :SetDescription("Ban a player (duration in minutes, 0 = permanent)")
    :AddArgument("steamid", true)
    :AddArgument("reason", false)
    :AddArgument("duration", false)
    :SetHandler(function(p)
        RunConsoleCommand("banid", p.duration or 0, p.steamid)
    end)
    :Register()

GModPanel.NewExecutor("unban")
    :SetDescription("Remove a ban by SteamID")
    :AddArgument("steamid", true)
    :SetHandler(function(p)
        RunConsoleCommand("removeid", p.steamid)
    end)
    :Register()

GModPanel.NewExecutor("warn")
    :SetDescription("Issue an in-game warning to a player")
    :AddArgument("steamid", true)
    :AddArgument("reason", false)
    :SetHandler(function(p)
        local ply = player.GetBySteamID64(p.steamid)
        if IsValid(ply) then
            ply:ChatPrint("[GModPanel] Warning: " .. (p.reason or ""))
        end
    end)
    :Register()

GModPanel.NewExecutor("mute")
    :SetDescription("Mute a player in voice and text for N minutes")
    :AddArgument("steamid", true)
    :AddArgument("duration", false)
    :SetHandler(function(p)
        local ply = player.GetBySteamID64(p.steamid)
        if not IsValid(ply) then return end
        
        -- Use GMod's built-in mute if available, otherwise silence voice
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

GModPanel.NewExecutor("message")
    :SetDescription("Broadcast a message to all players")
    :AddArgument("text", true)
    :SetHandler(function(p)
        for _, ply in ipairs(player.GetAll()) do
            ply:ChatPrint("[GModPanel] " .. p.text)
        end
    end)
    :Register()

GModPanel.NewExecutor("sendto")
    :SetDescription("Teleport an admin to a target player")
    :AddArgument("steamid", true)   -- admin
    :AddArgument("target", true)    -- target player
    :SetHandler(function(p)
        local admin  = player.GetBySteamID64(p.steamid)
        local target = player.GetBySteamID64(p.target)
        if IsValid(admin) and IsValid(target) then
            admin:SetPos(target:GetPos())
        end
    end)
    :Register()

GModPanel.NewExecutor("spectate")
    :SetDescription("Force a player into spectate mode")
    :AddArgument("steamid", true)
    :SetHandler(function(p)
        local ply = player.GetBySteamID64(p.steamid)
        if IsValid(ply) then
            ply:SetTeam(TEAM_SPECTATOR)
        end
    end)
    :Register()

GModPanel.NewExecutor("rcon")
    :SetDescription("Execute a raw console command (opt-in only)")
    :AddArgument("cmd", true)
    :SetHandler(function(p)
        if GModPanel.Config.allow_rcon then
            RunConsoleCommand(p.cmd)
        else
            GModPanel.Warn("rcon command ignored — allow_rcon is disabled in config.lua")
        end
    end)
    :Register()

GModPanel.NewExecutor("map_change")
    :SetDescription("Change server map")
    :AddArgument("map", true)
    :SetHandler(function(p)
        RunConsoleCommand("changelevel", p.map)
    end)
    :Register()