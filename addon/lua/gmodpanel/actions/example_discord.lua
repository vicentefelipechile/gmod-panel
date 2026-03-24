--[[--------------------------------------------------------------------
    gmodpanel/actions/example_custom_event.lua
    Example action script: sending a custom event to the GModPanel Worker.
    Copy and rename this file to create your own actions.
    Loaded automatically by gmodpanel_init.lua on server start.
--------------------------------------------------------------------]]--

--[[-------------------------------------------------------------------
    Example: send a custom "player_vip_join" event to the panel
    whenever a player with a specific SteamID64 joins the server.
    The event will appear in the dashboard event feed in real time.
--------------------------------------------------------------------]]--

--[[ UNCOMMENT TO ENABLE:

local VIP_STEAMIDS = {
    ["76561198000000000"] = true,
    ["76561198000000001"] = true,
}

hook.Add("PlayerInitialSpawn", "GModPanel_VIPJoin", function(ply)
    if not VIP_STEAMIDS[ply:SteamID64()] then return end

    -- GModPanel.EnsureSession handles auth automatically
    GModPanel.EnsureSession(function()
        http.Post(
            GModPanel.Config.api_base .. "/api/v1/event",
            util.TableToJSON({
                event   = "player_vip_join",
                ts      = os.time(),
                map     = game.GetMap(),
                steamid = ply:SteamID64(),
                name    = ply:Nick(),
            }),
            nil, nil,
            GModPanel.AuthHeaders()
        )
    end)
end)

]]--
