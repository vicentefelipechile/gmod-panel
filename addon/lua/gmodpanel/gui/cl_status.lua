--[[--------------------------------------------------------------------
    gui/cl_status.lua
    Status tab for the GModPanel GUI. Shows the active session state,
    last heartbeat time, and any recent errors.
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Variables
--------------------------------------------------------------------]]--

local last_status = {
    session  = "Unknown",
    last_hb  = "Never",
    map      = "Unknown",
    players  = "0",
    errors   = {},
}

--[[--------------------------------------------------------------------
    Components
--------------------------------------------------------------------]]--

function GModPanel.CreateStatusPanel(parent)
    local panel = vgui.Create("DPanel", parent)
    panel:Dock(FILL)

    local function Row(label, key)
        local row = vgui.Create("DPanel", panel)
        row:Dock(TOP)
        row:SetTall(28)
        row:DockMargin(4, 2, 4, 0)

        local lbl = vgui.Create("DLabel", row)
        lbl:SetText(label)
        lbl:SetWide(160)
        lbl:Dock(LEFT)

        local val = vgui.Create("DLabel", row)
        val:SetText(last_status[key] or "—")
        val:Dock(FILL)

        return val
    end

    local session_val = Row("Session:",     "session")
    local hb_val      = Row("Last HB:",    "last_hb")
    local map_val     = Row("Map:",         "map")
    local players_val = Row("Players:",     "players")

    -- Refresh every 2 seconds
    panel:SetPaintedManually(false)
    timer.Create("GModPanel_StatusRefresh", 2, 0, function()
        if not IsValid(panel) then
            timer.Remove("GModPanel_StatusRefresh")
            return
        end
        session_val:SetText(last_status.session)
        hb_val:SetText(last_status.last_hb)
        map_val:SetText(last_status.map)
        players_val:SetText(last_status.players)
    end)

    return panel
end

--[[--------------------------------------------------------------------
    Functions
--------------------------------------------------------------------]]--

-- Called by the main GUI or other modules to update status display
function GModPanel.UpdateStatus(data)
    if data.session  then last_status.session  = data.session end
    if data.last_hb  then last_status.last_hb  = data.last_hb end
    if data.map      then last_status.map       = data.map end
    if data.players  then last_status.players   = tostring(data.players) end
end

--[[--------------------------------------------------------------------
    Init
--------------------------------------------------------------------]]--

net.Receive("GModPanel_StatusUpdate", function()
    local data = util.JSONToTable(net.ReadString()) or {}
    GModPanel.UpdateStatus(data)
end)
