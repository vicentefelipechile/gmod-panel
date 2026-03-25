--[[--------------------------------------------------------------------
    sv_events.lua
    Hook registrations for game events. Sends each event to the Worker
    immediately via HTTP (not waiting for the next heartbeat).
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Functions
--------------------------------------------------------------------]]--

local function SendEvent(event_type, data)
    data.event = event_type
    data.ts    = os.time()
    data.map   = game.GetMap()

    local payload = util.TableToJSON(data)

    GModPanel.EnsureSession(function()
        HTTP({
            url = GModPanel.Config.api_base .. "/api/v1/event",
            method = "POST",
            headers = GModPanel.AuthHeaders(),
            body = payload,
            success = function(code, body, headers)
                if code ~= 200 and GModPanel.Config.debug then
                    GModPanel.Warn("Event '", event_type, "' send failed: HTTP ", tostring(code))
                end
            end,
            failed = function(err)
                if GModPanel.Config.debug then
                    GModPanel.Warn("Event '", event_type, "' error: ", tostring(err))
                end
            end
        })
    end)
end

GModPanel.SendEvent = SendEvent