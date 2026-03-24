--[[--------------------------------------------------------------------
    sv_commands.lua
    Declarative command executor system. Registers all supported command
    types and processes the command queue received from the Worker.
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Variables
--------------------------------------------------------------------]]--

local handlers = {}  -- { [type] = executor_object }

--[[--------------------------------------------------------------------
    Executor API
--------------------------------------------------------------------]]--

local Executor = {}
Executor.__index = Executor

function GModPanel.NewExecutor(cmd_type)
    local self = setmetatable({}, Executor)
    self._type        = cmd_type
    self._description = ""
    self._args        = {}
    self._handler     = nil
    return self
end

function Executor:SetDescription(desc)
    self._description = desc
    return self
end

-- required = true  → validated before calling handler
-- required = false → optional (nil if absent)
function Executor:AddArgument(name, required)
    table.insert(self._args, { name = name, required = required == true })
    return self
end

function Executor:SetHandler(fn)
    self._handler = fn
    return self
end

function Executor:Register()
    if not self._type then
        GModPanel.Error("Executor has no type — use GModPanel.NewExecutor(\"type\")")
        return
    end
    handlers[self._type] = self
    if GModPanel.Config.debug then
        GModPanel.Print("Executor registered: ", self._type)
    end
    return self
end

function Executor:Execute(payload)
    for _, arg in ipairs(self._args) do
        if arg.required and payload[arg.name] == nil then
            GModPanel.Warn(
                "Executor '", self._type,
                "': missing required argument '", arg.name, "'"
            )
            return false, "missing argument: " .. arg.name
        end
    end
    local ok, err = pcall(self._handler, payload)
    if not ok then
        GModPanel.Error("Executor '", self._type, "' error: ", tostring(err))
    end
    return ok, ok and nil or tostring(err)
end

--[[--------------------------------------------------------------------
    Command Declarations
--------------------------------------------------------------------]]--

GModPanel.NewExecutor("kick")
    :SetDescription("Kick a player from the server")
    :AddArgument("steamid", true)
    :AddArgument("reason", false)
    :SetHandler(function(p)
        local ply = GModPanel.FindPlayer(p.steamid)
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
        game.ConsoleCommand(string.format(
            "banid %d %s\n", p.duration or 0, p.steamid
        ))
    end)
    :Register()

GModPanel.NewExecutor("unban")
    :SetDescription("Remove a ban by SteamID")
    :AddArgument("steamid", true)
    :SetHandler(function(p)
        game.ConsoleCommand("removeid " .. p.steamid .. "\n")
    end)
    :Register()

GModPanel.NewExecutor("warn")
    :SetDescription("Issue an in-game warning to a player")
    :AddArgument("steamid", true)
    :AddArgument("reason", false)
    :SetHandler(function(p)
        local ply = GModPanel.FindPlayer(p.steamid)
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
        local ply = GModPanel.FindPlayer(p.steamid)
        if IsValid(ply) then
            -- Use GMod's built-in mute if available, otherwise silence voice
            ply:SetNWBool("GModPanel_Muted", true)
            ply:ChatPrint("[GModPanel] You have been muted.")
            if p.duration and p.duration > 0 then
                timer.Simple(p.duration * 60, function()
                    if IsValid(ply) then
                        ply:SetNWBool("GModPanel_Muted", false)
                        ply:ChatPrint("[GModPanel] Your mute has expired.")
                    end
                end)
            end
        end
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

GModPanel.NewExecutor("goto")
    :SetDescription("Teleport an admin to a target player")
    :AddArgument("steamid", true)   -- admin
    :AddArgument("target", true)    -- target player
    :SetHandler(function(p)
        local admin  = GModPanel.FindPlayer(p.steamid)
        local target = GModPanel.FindPlayer(p.target)
        if IsValid(admin) and IsValid(target) then
            admin:SetPos(target:GetPos())
        end
    end)
    :Register()

GModPanel.NewExecutor("spectate")
    :SetDescription("Force a player into spectate mode")
    :AddArgument("steamid", true)
    :SetHandler(function(p)
        local ply = GModPanel.FindPlayer(p.steamid)
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
            game.ConsoleCommand(p.cmd .. "\n")
        else
            GModPanel.Warn("rcon command ignored — allow_rcon is disabled in config.lua")
        end
    end)
    :Register()

GModPanel.NewExecutor("map_change")
    :SetDescription("Change server map")
    :AddArgument("map", true)
    :SetHandler(function(p)
        game.ConsoleCommand("changelevel " .. p.map .. "\n")
    end)
    :Register()

--[[--------------------------------------------------------------------
    Command Processor
--------------------------------------------------------------------]]--

function GModPanel.ProcessCommands(res)
    if not res or not res.commands then return end
    local ack_list = {}

    for _, cmd in ipairs(res.commands) do
        local executor = handlers[cmd.type]
        local ok, err

        if executor then
            ok, err = executor:Execute(cmd.payload or {})
        else
            GModPanel.Warn("Unknown command type: ", tostring(cmd.type))
            ok, err = false, "unknown command type"
        end

        table.insert(ack_list, { id = cmd.id, ok = ok, error = err })
    end

    if #ack_list > 0 then
        GModPanel.EnsureSession(function()
            http.Post(
                GModPanel.Config.api_base .. "/api/v1/command/ack",
                util.TableToJSON({ acks = ack_list }),
                nil,
                function(err)
                    GModPanel.Warn("Command ack error: ", tostring(err))
                end,
                GModPanel.AuthHeaders()
            )
        end)
    end
end
