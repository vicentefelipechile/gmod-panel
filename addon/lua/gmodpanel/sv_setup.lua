--[[--------------------------------------------------------------------
    sv_setup.lua
    First-boot flow: obtains setup_code from the Worker, shows it to
    the superadmin, polls until the Worker confirms the link, then
    writes gmodpanel.dat and starts the normal session flow.
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Variables
--------------------------------------------------------------------]]--

local setup_code = nil
local dat_key    = nil

--[[--------------------------------------------------------------------
    Functions
--------------------------------------------------------------------]]--

local function OnSetupComplete(server_id, api_key)
    GModPanel.Print("Server linked! server_id: ", server_id)
    -- Write identity to disk (obfuscated using dat_key)
    GModPanel.WriteIdentity(server_id, api_key, dat_key)

    -- Also write a plaintext meta file with just server_id for restart recovery
    file.Write("gmodpanel.dat.meta", util.TableToJSON({ server_id = server_id }))

    -- Reset in-memory dat_key (stays alive for this session only)
    -- dat_key is intentionally not set to nil here — kept alive for this session's
    -- use in case LoadIdentity is called again within the same session context.

    GModPanel.Print("Starting handshake...")
    GModPanel.Handshake(function()
        GModPanel.Print("Setup complete. GModPanel is now active.")
        -- Notify in-game GUI
        net.Start("GModPanel_SetupComplete")
        net.Send(player.GetAll())
    end)
end

local function PollSetup()
    if not setup_code then return end

    http.Fetch(
        GModPanel.Config.api_base .. "/api/v1/setup/poll?code=" .. setup_code,
        function(body, _, _, code)
            if code == 202 then
                -- Still waiting — continue polling
                return
            end

            if code == 200 then
                local res = util.JSONToTable(body)
                if res and res.server_id and res.api_key then
                    timer.Remove("GModPanel_SetupPoll")
                    OnSetupComplete(res.server_id, res.api_key)
                end
                return
            end

            -- Code expired or error
            GModPanel.Error("Setup poll error: HTTP ", tostring(code), " — retrying setup.")
            timer.Remove("GModPanel_SetupPoll")
            GModPanel.StartSetup()
        end,
        function(err)
            GModPanel.Warn("Setup poll fetch error: ", tostring(err))
        end
    )
end

function GModPanel.StartSetup()
    GModPanel.Print("Requesting setup code from Worker...")

    http.Fetch(
        GModPanel.Config.api_base .. "/api/v1/setup/code",
        function(body, _, _, code)
            if code ~= 200 then
                GModPanel.Error("Could not get setup code: HTTP ", tostring(code))
                return
            end

            local res = util.JSONToTable(body)
            if not res or not res.setup_code or not res.dat_key then
                GModPanel.Error("Setup code response malformed.")
                return
            end

            setup_code = res.setup_code
            dat_key    = res.dat_key  -- kept in memory ONLY

            -- Print to console
            GModPanel.Print("=========================================")
            GModPanel.Print("Addon not configured. Visit:")
            GModPanel.Print(res.setup_url or (GModPanel.Config.api_base .. "/setup"))
            GModPanel.Print("Linking code: ", setup_code, "  (expires in 10 min)")
            GModPanel.Print("=========================================")

            -- Notify GUI
            net.Start("GModPanel_SetupCode")
            net.WriteString(setup_code)
            net.WriteString(res.setup_url or "")
            net.Send(player.GetAll())

            -- Start polling every 5 seconds
            timer.Create("GModPanel_SetupPoll", 5, 0, PollSetup)
        end,
        function(err)
            GModPanel.Error("Setup fetch error: ", tostring(err))
        end
    )
end

--[[--------------------------------------------------------------------
    Init
--------------------------------------------------------------------]]--

-- sv_core.lua calls GModPanel.StartSetup() when needed.
-- This file intentionally has no self-starting init block.
