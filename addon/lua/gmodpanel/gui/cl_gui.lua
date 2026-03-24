--[[--------------------------------------------------------------------
    gui/cl_gui.lua
    Main GModPanel GUI window. Opens on F6 (superadmins only).
    Provides a tabbed interface: Status tab (more tabs can be added).
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Variables
--------------------------------------------------------------------]]--

local main_frame = nil
local OPEN_KEY   = KEY_F6

--[[--------------------------------------------------------------------
    Components
--------------------------------------------------------------------]]--

local function BuildGUI()
    if IsValid(main_frame) then
        main_frame:Remove()
        main_frame = nil
        return
    end

    local frame = vgui.Create("DFrame")
    frame:SetTitle("GModPanel — Server Dashboard")
    frame:SetSize(700, 480)
    frame:Center()
    frame:MakePopup()
    frame:SetDraggable(true)
    main_frame = frame

    local sheet = vgui.Create("DPropertySheet", frame)
    sheet:Dock(FILL)
    sheet:DockMargin(4, 4, 4, 4)

    -- Status tab
    local status_panel = GModPanel.CreateStatusPanel(sheet)
    sheet:AddSheet("Status", status_panel, "icon16/server.png")

    frame.OnClose = function()
        main_frame = nil
    end
end

--[[--------------------------------------------------------------------
    Functions
--------------------------------------------------------------------]]--

-- (none beyond key bind)

--[[--------------------------------------------------------------------
    Init
--------------------------------------------------------------------]]--

hook.Add("PlayerButtonDown", "GModPanel_OpenGUI", function(ply, btn)
    if btn ~= OPEN_KEY then return end
    if not LocalPlayer():IsSuperAdmin() then return end
    BuildGUI()
end)
