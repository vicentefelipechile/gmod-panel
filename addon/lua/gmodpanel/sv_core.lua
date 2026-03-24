--[[--------------------------------------------------------------------
    sv_core.lua
    Main initialization for GModPanel. Checks if gmodpanel.dat exists:
    if not, enters setup mode; otherwise loads identity and starts the
    normal handshake flow.
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Variables
--------------------------------------------------------------------]]--

local PREFIX = "[GModPanel] "

--[[--------------------------------------------------------------------
    Functions
--------------------------------------------------------------------]]--

function GModPanel.Print(...)
    MsgC(Color(120, 200, 255), PREFIX)
    MsgC(Color(255, 255, 255), ..., "\n")
end

function GModPanel.Warn(...)
    MsgC(Color(255, 200, 50), PREFIX .. "[WARN] ")
    MsgC(Color(255, 255, 255), ..., "\n")
end

function GModPanel.Error(...)
    MsgC(Color(255, 80, 80), PREFIX .. "[ERROR] ")
    MsgC(Color(255, 255, 255), ..., "\n")
end

function GModPanel.FindPlayer(steamid64)
    for _, ply in ipairs(player.GetAll()) do
        if ply:SteamID64() == steamid64 then
            return ply
        end
    end
    return nil
end

--[[--------------------------------------------------------------------
    Init
--------------------------------------------------------------------]]--

hook.Add("Initialize", "GModPanel_Boot", function()
    GModPanel.Print("Booting GModPanel...")

    if not file.Exists("gmodpanel.dat", "DATA") then
        GModPanel.Print("No credentials found — entering setup mode.")
        include("gmodpanel/sv_setup.lua")
        GModPanel.StartSetup()
    else
        GModPanel.Print("Credentials found — loading identity...")
        GModPanel.LoadIdentity(function(ok)
            if not ok then
                GModPanel.Error("Failed to load identity. Re-running setup.")
                include("gmodpanel/sv_setup.lua")
                GModPanel.StartSetup()
                return
            end
            GModPanel.Print("Identity loaded. Starting handshake...")
            GModPanel.Handshake(function()
                GModPanel.Print("Ready.")
            end)
        end)
    end
end)
