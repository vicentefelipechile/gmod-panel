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
            HTTP({
                url = GModPanel.Config.api_base .. "/api/v1/command/ack",
                method = "POST",
                headers = GModPanel.AuthHeaders(),
                body = util.TableToJSON({ acks = ack_list }),
                success = function(code, body, headers)
                    if code ~= 200 and GModPanel.Config.debug then
                        GModPanel.Warn("Command ack failed: HTTP ", tostring(code))
                    end
                end,
                failed = function(err)
                    GModPanel.Warn("Command ack error: ", tostring(err))
                end
            })
        end)
    end
end
