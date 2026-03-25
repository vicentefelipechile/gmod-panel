--[[--------------------------------------------------------------------
    sv_heartbeat.lua
    Periodic HTTP heartbeat sender. Builds the server state payload and
    sends it to the Worker every N seconds. Processes the command queue
    returned in the response.
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Functions
--------------------------------------------------------------------]]--

local function BuildPayload()
    local players = {}
    for _, ply in ipairs(player.GetAll()) do
        table.insert(players, {
            steamid  = ply:SteamID64(),
            name     = ply:Nick(),
            ping     = ply:Ping(),
            team     = team.GetName(ply:Team()),
            playtime = math.floor(ply:TimeConnected()),
        })
    end

    return util.TableToJSON({
        timestamp    = os.time(),
        map          = game.GetMap(),
        gamemode     = engine.ActiveGamemode(),
        player_count = #player.GetAll(),
        max_players  = game.MaxPlayers(),
        fps          = math.floor(1 / engine.TickInterval()),
        tickrate     = math.floor(1 / engine.TickInterval()),
        players      = players,
    })
end

local function DoHeartbeat()
    local payload = BuildPayload()

    HTTP({
        url = GModPanel.Config.api_base .. "/api/v1/heartbeat",
        method = "POST",
        headers = GModPanel.AuthHeaders(),
        body = payload,
        success = function(code, body, headers)
            if code == 401 then
                -- Session was invalidated server-side; re-handshake immediately
                GModPanel.Session.token = nil
                GModPanel.Warn("Session rejected (401). Re-handshaking...")
                GModPanel.Handshake()
                return
            end

            if code ~= 200 then
                GModPanel.Warn("Heartbeat failed: HTTP ", tostring(code))
                return
            end

            local res = util.JSONToTable(body)
            if res then
                GModPanel.ProcessCommands(res)
            end
        end,
        failed = function(err)
            GModPanel.Warn("Heartbeat error: ", tostring(err))
        end
    })
end

--[[--------------------------------------------------------------------
    Timers
--------------------------------------------------------------------]]--

timer.Create("GModPanel_Heartbeat", GModPanel.Config.heartbeat, 0, function()
    GModPanel.EnsureSession(DoHeartbeat)
end)
