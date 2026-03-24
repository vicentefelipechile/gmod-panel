--[[--------------------------------------------------------------------
    gmodpanel/commands/example_say.lua
    Example custom command script.
    Drop .lua files in this folder to add new dashboard commands
    without touching any core GModPanel files.

    Each file should use GModPanel.NewExecutor() to register commands.
    They are loaded automatically by gmodpanel_init.lua on server start.
--------------------------------------------------------------------]]--

--[[-------------------------------------------------------------------
    Example: "say" command — broadcasts a colored chat message
    Dashboard payload: { text = "Hello!", color = "red" }
--------------------------------------------------------------------]]--

--[[ UNCOMMENT TO ENABLE:

GModPanel.NewExecutor("say")
    :SetDescription("Broadcast a colored chat announcement")
    :AddArgument("text", true)
    :AddArgument("color", false)
    :SetHandler(function(p)
        local color = Color(255, 255, 255)

        if p.color == "red"    then color = Color(255, 80,  80)  end
        if p.color == "green"  then color = Color(80,  255, 80)  end
        if p.color == "yellow" then color = Color(255, 220, 50)  end
        if p.color == "blue"   then color = Color(80,  150, 255) end

        for _, ply in ipairs(player.GetAll()) do
            ply:PrintMessage(HUD_PRINTCHAT, "[GModPanel] " .. p.text)
        end
    end)
    :Register()

]]--
