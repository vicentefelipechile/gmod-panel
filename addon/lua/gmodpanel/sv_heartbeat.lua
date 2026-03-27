--[[--------------------------------------------------------------------
    sv_heartbeat.lua
    Periodic HTTP heartbeat sender. Builds the server state payload and
    sends it to the Worker every N seconds. Processes the command queue
    returned in the response.
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Variables
--------------------------------------------------------------------]]--

-- Hash of the last-sent registry, so we only send when it changes
local LastRegistryHash = nil

--[[--------------------------------------------------------------------
    Functions
--------------------------------------------------------------------]]--

local function GetTeams()
    local teams = {}
    for index, data in pairs(team.GetAllTeams()) do
        if index ~= TEAM_UNASSIGNED and index ~= TEAM_CONNECTING then
            table.insert(teams, {
                index = index,
                name  = data.Name or tostring(index),
            })
        end
    end
    return teams
end

local function GetMaps()
    local maps = {}
    local files = file.Find("maps/*.bsp", "GAME")
    for i = 1, math.min(#files, 250) do
        local name = string.StripExtension(files[i])
        table.insert(maps, name)
    end
    table.sort(maps)
    return maps
end

-- Returns the registry JSON and whether it changed since last send
local function GetRegistry()
    local list    = GModPanel.BuildRegistry()
    local json    = util.TableToJSON(list)
    local hash    = util.CRC(json)

    if hash == LastRegistryHash then
        return nil, false  -- unchanged — skip sending
    end

    LastRegistryHash = hash
    return list, true
end

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

    local registry, changed = GetRegistry()

    local payload = {
        timestamp    = os.time(),
        map          = game.GetMap(),
        gamemode     = engine.ActiveGamemode(),
        player_count = #player.GetAll(),
        max_players  = game.MaxPlayers(),
        fps          = math.floor(1 / engine.TickInterval()),
        tickrate     = math.floor(1 / engine.TickInterval()),
        players      = players,
        teams        = GetTeams(),
        maps         = GetMaps(),
        -- Live server identity values (read by Config tab)
        server_name  = GetConVar("hostname"):GetString(),
        -- sv_password  = GetConVar("sv_password"):GetString(),
        region       = GetConVar("sv_region"):GetInt(),
        friendlyfire = GetConVar("mp_friendlyfire") and GetConVar("mp_friendlyfire"):GetInt() or 0,
    }

    -- Only include registry when it has changed (saves bandwidth)
    if changed and registry then
        payload.command_registry = registry
    end

    return util.TableToJSON(payload)
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

hook.Add("Initialize", "GModPanel_InitHeartbeat", function()
    -- Force registry send on first heartbeat
    LastRegistryHash = nil

    timer.Create("GModPanel_Heartbeat", GModPanel.Config.heartbeat, 0, function()
        GModPanel.EnsureSession(DoHeartbeat)
    end)
end)
