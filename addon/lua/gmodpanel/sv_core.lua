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

local COLOR_WARN = Color(255, 200, 50)
local COLOR_ERROR = Color(255, 80, 80)
local COLOR_INFO = Color(120, 200, 255)

--[[--------------------------------------------------------------------
    Functions
--------------------------------------------------------------------]]--

local function ts(...)
    local t = ""
    for _, v in ipairs({...}) do
        t = t .. tostring(v) .. " "
    end

    return t
end

function GModPanel.Print(...)
    MsgC(COLOR_INFO, PREFIX, color_white, ts(...) .. "\n")
end

function GModPanel.Warn(...)
    MsgC(COLOR_WARN, PREFIX, color_white, "WARN " .. ts(...) .. "\n")
end

function GModPanel.Error(...)
    MsgC(COLOR_ERROR, PREFIX, color_white, "ERROR " .. ts(...) .. "\n")
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
