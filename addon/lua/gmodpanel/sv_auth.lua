--[[--------------------------------------------------------------------
    sv_auth.lua
    Handshake, session token management, and credential loading from
    gmodpanel.dat. All credential access is local to this file.
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Variables
--------------------------------------------------------------------]]--

-- Private credential store — never accessible as a global
local Identity = {
    server_id = nil,
    api_key   = nil,
}

--[[--------------------------------------------------------------------
    Internal Functions
--------------------------------------------------------------------]]--

local function DeobfuscateDat(raw, dat_key)
    local decoded = util.Base64Decode(raw)
    local key_len = #dat_key
    local result  = {}
    for i = 1, #decoded do
        result[i] = string.char(bit.bxor(
            string.byte(decoded, i),
            string.byte(dat_key, ((i - 1) % key_len) + 1)
        ))
    end
    return table.concat(result)
end

local function ObfuscateDat(plain, dat_key)
    local key_len = #dat_key
    local result  = {}
    for i = 1, #plain do
        result[i] = string.char(bit.bxor(
            string.byte(plain, i),
            string.byte(dat_key, ((i - 1) % key_len) + 1)
        ))
    end
    return util.Base64Encode(table.concat(result))
end

local function LoadIdentityWithKey(dat_key)
    if not file.Exists("gmodpanel.dat", "DATA") then return false end
    local raw = file.Read("gmodpanel.dat", "DATA")
    if not raw then return false end

    local plain = DeobfuscateDat(raw, dat_key)
    local data  = util.JSONToTable(plain)

    if not data or not data.server_id or not data.api_key then
        GModPanel.Error("gmodpanel.dat is corrupt or dat_key is incorrect.")
        return false
    end

    Identity.server_id = data.server_id
    Identity.api_key   = data.api_key
    return true
end

local function FetchDatKey(server_id, callback)
    http.Fetch(
        GModPanel.Config.api_base .. "/api/v1/setup/datkey?server_id=" .. server_id,
        function(body, _, _, code)
            if code ~= 200 then
                GModPanel.Error("Could not fetch dat_key: HTTP ", tostring(code))
                return
            end
            local res = util.JSONToTable(body)
            if res and res.dat_key then
                callback(res.dat_key)
            else
                GModPanel.Error("dat_key response malformed.")
            end
        end,
        function(err)
            GModPanel.Error("FetchDatKey error: ", tostring(err))
        end
    )
end

--[[--------------------------------------------------------------------
    Public API
--------------------------------------------------------------------]]--

-- Called by sv_setup.lua after first-boot to write gmodpanel.dat
function GModPanel.WriteIdentity(server_id, api_key, dat_key)
    local plain = util.TableToJSON({ server_id = server_id, api_key = api_key })
    local obfuscated = ObfuscateDat(plain, dat_key)
    file.Write("gmodpanel.dat", obfuscated)
    -- Load into memory immediately
    Identity.server_id = server_id
    Identity.api_key   = api_key
    GModPanel.Print("Identity saved to gmodpanel.dat.")
end

-- Called on boot to restore Identity from disk using the Worker-issued dat_key
function GModPanel.LoadIdentity(callback)
    if not file.Exists("gmodpanel.dat", "DATA") then
        callback(false)
        return
    end

    -- Try to extract server_id from the obfuscated file using a plaintext header.
    -- For simplicity in the MVP, we store server_id unobfuscated at the very end
    -- of the file as a JSON comment (not ideal; a real implementation would use
    -- a structured binary format with a plaintext header section).
    local sid_raw = file.Read("gmodpanel.dat.txt", "DATA")
    if not sid_raw then
        GModPanel.Error("gmodpanel.dat.txt missing — cannot retrieve dat_key.")
        callback(false)
        return
    end

    local meta = util.JSONToTable(sid_raw)
    if not meta or not meta.server_id then
        GModPanel.Error("gmodpanel.dat.txt malformed.")
        callback(false)
        return
    end

    FetchDatKey(meta.server_id, function(dat_key)
        local ok = LoadIdentityWithKey(dat_key)
        callback(ok)
    end)
end

-- Initiates the handshake and stores the session token
function GModPanel.Handshake(callback)
    local payload = util.TableToJSON({
        server_id = Identity.server_id,
        api_key   = Identity.api_key,
        timestamp = os.time(),
    })

    HTTP({
        url = GModPanel.Config.api_base .. "/api/v1/handshake",
        method = "POST",
        headers = { ["Content-Type"] = "application/json" },
        body = payload,
        success = function(code, body, headers)
            if code ~= 200 then
                GModPanel.Error("Handshake failed: HTTP ", tostring(code))
                return
            end

            local res = util.JSONToTable(body)
            if not res or not res.session_token then
                GModPanel.Error("Handshake: invalid response.")
                return
            end

            GModPanel.Session.token      = res.session_token
            GModPanel.Session.expires_at = os.time() + (res.expires_in or 7200)
            GModPanel.Print("Session established.")

            if callback then callback() end
        end,
        failed = function(err)
            GModPanel.Error("Handshake error: ", tostring(err))
        end
    })
end

-- Returns auth headers for any outbound request
-- ONLY function allowed to read Identity
function GModPanel.AuthHeaders()
    return {
        ["Content-Type"]    = "application/json",
        ["X-Server-ID"]     = Identity.server_id,
        ["X-Session-Token"] = GModPanel.Session.token or "",
    }
end

-- Ensures a valid session exists before calling the callback
function GModPanel.EnsureSession(callback)
    if not GModPanel.Session.token or os.time() >= GModPanel.Session.expires_at then
        GModPanel.Handshake(callback)
    else
        callback()
    end
end

--[[--------------------------------------------------------------------
    Timers
--------------------------------------------------------------------]]--

-- Proactive renewal: re-handshake 60s before expiry
timer.Create("GModPanel_SessionRenew", 30, 0, function()
    if GModPanel.Session.token and os.time() >= GModPanel.Session.expires_at - 60 then
        GModPanel.Warn("Session expiring soon, renewing...")
        GModPanel.Handshake()
    end
end)
