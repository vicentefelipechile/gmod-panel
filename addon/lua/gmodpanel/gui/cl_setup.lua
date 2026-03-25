--[[--------------------------------------------------------------------
    gui/cl_setup.lua
    Client-side first-boot screen. Shown to superadmins when the addon
    is not yet configured. Displays the setup code and URL.
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Variables
--------------------------------------------------------------------]]--

local setup_frame = nil

--[[--------------------------------------------------------------------
    Components
--------------------------------------------------------------------]]--

local function CreateSetupUI(code, url)
    if IsValid(setup_frame) then setup_frame:Remove() end

    local frame = vgui.Create("DFrame")
    frame:SetTitle("GModPanel — First-Time Setup")
    frame:SetSize(480, 260)
    frame:Center()
    frame:SetDraggable(true)
    frame:MakePopup()
    setup_frame = frame

    local title = vgui.Create("DLabel", frame)
    title:SetText("GModPanel is not configured")
    title:SetFont("DermaLarge")
    title:SizeToContents()
    title:SetPos(20, 40)

    local desc = vgui.Create("DLabel", frame)
    desc:SetText("Open the URL below in your browser and enter the linking code:")
    desc:SetWrap(true)
    desc:SetSize(440, 40)
    desc:SetPos(20, 70)

    local url_label = vgui.Create("DLabel", frame)
    url_label:SetText(url)
    url_label:SetFont("DermaDefaultBold")
    url_label:SizeToContents()
    url_label:SetPos(20, 110)
    url_label:SetCursor("hand")

    local code_label = vgui.Create("DLabel", frame)
    code_label:SetText("Linking code: " .. code)
    code_label:SetFont("DermaLarge")
    code_label:SizeToContents()
    code_label:SetPos(20, 140)

    local hint = vgui.Create("DLabel", frame)
    hint:SetText("This window will close automatically when linking is complete.")
    hint:SetSize(440, 30)
    hint:SetPos(20, 185)

    local close_btn = vgui.Create("DButton", frame)
    close_btn:SetText("Close")
    close_btn:SetSize(100, 28)
    close_btn:SetPos(360, 210)
    close_btn.DoClick = function() frame:Remove() end
end

--[[--------------------------------------------------------------------
    Functions
--------------------------------------------------------------------]]--

-- (none beyond net receivers)

--[[--------------------------------------------------------------------
    Init
--------------------------------------------------------------------]]--

net.Receive("GModPanel_SetupCode", function()
    local code = net.ReadString()
    local url  = net.ReadString()

    CreateSetupUI(code, url)
end)

net.Receive("GModPanel_SetupComplete", function()
    if IsValid(setup_frame) then
        setup_frame:Remove()
    end
    notification.AddLegacy("[GModPanel] Server linked successfully!", NOTIFY_GENERIC, 5)
end)
