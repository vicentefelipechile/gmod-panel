--[[--------------------------------------------------------------------
    Error Handling
--------------------------------------------------------------------]]--

ErrorHandling = ErrorHandling or {}

--[[--------------------------------------------------------------------
    Local Variables
--------------------------------------------------------------------]]--

local STRING_PREFIX = "[ErrorHandling] "
local COLOR_PREFIX = Color(255, 100, 100)
local COLOR_YELLOW = Color(255, 255, 100)
local COLOR_WHITE = color_white


local isstring = isstring
local isnumber = isnumber
local istable = istable
local isbool = isbool
local isentity = isentity
local isvector = isvector
local isangle = isangle
local IsColor = IsColor
local IsValid = IsValid

local VERIFICATION_TYPE = {
    ["string"] = isstring,
    ["number"] = isnumber,
    ["table"] = istable,
    ["boolean"] = isbool,
    ["player"] = function(v) return IsValid(v) and v:IsPlayer() end,
    ["entity"] = isentity,
    ["vector"] = isvector,
    ["angle"] = isangle,
    ["color"] = IsColor,
    ["function"] = isfunction,
    ["range"] = function(v)
        return isnumber(v) and v >= 0 and v <= 1
    end,
}

local FuncMatchRegEx = {
    { "Gemini:(.-)%(",         1 },
    { "(.-):(.-)%(",           2 },
    { "(.-)%.(.-)%(",          2 },
    { "ErrorHandling%.(.-)%(", 1 },
    { "(.-)%(",                1 },
}

local LuaRun = {
    ["@lua_run"] = true,
    ["@LuaCmd"] = true
}

--[[--------------------------------------------------------------------
    Functions
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
--- ErrorHandling.Error(Message, Value, Expected, UpValue)
---
--- A debugging utility function that generates detailed error messages for ErrorHandling functions.
--- This function gathers information about where an error occurred and produces a formatted error message.
---
--- **Notes:**
--- - Uses debug.getinfo to extract call information
--- - Reads the actual file content to display the line where the error occurred
--- - Attempts to determine the function name using regex patterns from FuncMatchRegEx
--- - Formats all information into a detailed error message
---
--- **Usage:**
--- ```lua
--- ErrorHandling.Error("Invalid position vector!", pos, "Vector")
--- ErrorHandling.Error("Cannot find material!", mat_name, "string (valid material path)")
--- ```
---
--- @param Message      string  The primary error message to display
--- @param Value        any     The problematic value that caused the error
--- @param Expected     any     The expected type or value description
--- @param UpValue      boolean When true, moves up one more stack frame to find the error source
--------------------------------------------------------------------]]--

function ErrorHandling.Error(Message, Value, Expected, UpValue)
    local Data = debug.getinfo( 3 + ( UpValue and 1 or 0 ) )

    local FilePath = LuaRun[ Data["source"] ] and "Console" or "lua/" .. string.match(Data["source"], "lua/(.*)")
    local File = ( FilePath == "Console" ) and "Console" or file.Read(FilePath, "GAME")
    local Line = string.Trim( string.Explode("\n", File)[Data["currentline"]] )

    local ErrorLine = "\t\t" .. Data["currentline"]
    local ErrorPath = "\t" .. FilePath
    local ErrorFunc = nil

    local AddQuota = ( type(Expected) == "string" ) and "\"" or ""
    local ErrorArg = "\t" .. AddQuota .. tostring(Value) .. AddQuota .. " (" .. type(Value) .. ")"

    for _, entry in ipairs(FuncMatchRegEx) do
        local pattern, captureIndex = entry[1], entry[2]
        local results = { string.match(Line, pattern) }
        if results[captureIndex] then
            ErrorFunc = results[captureIndex]
            break
        end
    end

    ErrorFunc = "\t" .. (ErrorFunc or "Unknown") .. "(...)"
    Expected = "\t" .. Expected

    error("\n" .. string.format([[
========  ErrorHandling ThrowError  ========
- Error found in: %s
- In the line: %s
- In the function: %s

- Argument: %s
- Expected: %s

- Error Message: %s
  
========  ErrorHandling ThrowError  ========]], ErrorPath, ErrorLine, ErrorFunc, ErrorArg, Expected, Message))
end


--[[--------------------------------------------------------------------
--- ErrorHandling.Checker(InfoTable)
---
--- A utility function that validates the type and conditions of a given value.
--- It checks if the value matches the expected type and additional conditions,
--- throwing an error if any validation fails.
---
--- **Notes:**
--- - Uses debug.getinfo to extract call information for error reporting
--- - Delegates to ErrorHandling.Error() for detailed error output
--- - Validates against VERIFICATION_TYPE entries; unknown types are rejected
--- - Empty strings are rejected even when ExpectedType is "string"
---
--- **Usage:**
--- ```lua
--- ErrorHandling.Checker({playerValue, "player", 1}) -- Checks if the first argument is a valid Player
--- ErrorHandling.Checker({nameValue, "string", 2})   -- Checks if the second argument is a non-empty string
--- ```
---
--- @param InfoTable    table   A table with exactly 3 entries:
---                             [1] any     - The value to be checked
---                             [2] string  - The expected type (e.g. "string", "number", "player")
---                             [3] number  - The argument position in the calling function
--------------------------------------------------------------------]]--

function ErrorHandling.Checker(InfoTable)
    if not istable(InfoTable) then
        ErrorHandling.Error([[The first argument of ErrorHandling.Checker() must be a table.]], InfoTable, "table")
    elseif table.IsEmpty(InfoTable) then
        ErrorHandling.Error([[The first argument of ErrorHandling.Checker() must not be empty.]], InfoTable, "table")
    end

    local ValueToCheck, ExpectedType, ArgumentPos = unpack(InfoTable)

    if not VERIFICATION_TYPE[ ExpectedType ] then
        ErrorHandling.Error([[The second argument of ErrorHandling.Checker() must be a valid type.]], ExpectedType, "a valid type")
    elseif not isnumber(ArgumentPos) then
        ErrorHandling.Error([[The third argument of ErrorHandling.Checker() must be a number.]], ArgumentPos, "number")
    end

    -- Verification
    local LuaDataInfo = debug.getinfo(2)

    if not VERIFICATION_TYPE[ ExpectedType ](ValueToCheck) then
        local Phrase = "The " .. string.CardinalToOrdinal(ArgumentPos) .. " argument of the function " .. LuaDataInfo["name"] .. "() must be a " .. ExpectedType .. "."
        ErrorHandling.Error(Phrase, ValueToCheck, ExpectedType, true)
    end

    if ExpectedType == "string" and ( ValueToCheck == "" ) then
        local Phrase = "The " .. string.CardinalToOrdinal(ArgumentPos) .. " argument of the function " .. LuaDataInfo["name"] .. "() must not be empty."
        ErrorHandling.Error(Phrase, ValueToCheck, ExpectedType, true)
    end
end

--[[--------------------------------------------------------------------
--- ErrorHandling.Warning(Message, Value, Expected, UpValue)
---
--- A debugging utility function that generates detailed warning messages for ErrorHandling functions.
--- This function gathers information about where a warning occurred and produces a formatted warning message.
---
--- **Notes:**
--- - Uses debug.getinfo to extract call information
--- - Reads the actual file content to display the line where the warning occurred
--- - Attempts to determine the function name using regex patterns from FuncMatchRegEx
--- - Formats all information into a detailed warning message printed via MsgC
---
--- **Usage:**
--- ```lua
--- ErrorHandling.Warning("Value out of expected range!", myVal, "range")
--- ErrorHandling.Warning("Entity may be invalid!", ent, "entity")
--- ```
---
--- @param Message      string  The primary warning message to display
--- @param Value        any     The problematic value that caused the warning
--- @param Expected     any     The expected type or value description
--- @param UpValue      boolean When true, moves up one more stack frame to find the warning source
--------------------------------------------------------------------]]--

function ErrorHandling.Warning(Message, Value, Expected, UpValue)
    local Data = debug.getinfo( 3 + ( UpValue and 1 or 0 ) )

    local FilePath = LuaRun[ Data["source"] ] and "Console" or "lua/" .. string.match(Data["source"], "lua/(.*)")
    local File = ( FilePath == "Console" ) and "Console" or file.Read(FilePath, "GAME")
    local Line = string.Trim( string.Explode("\n", File)[Data["currentline"]] )

    local WarnLine = "\t\t" .. Data["currentline"]
    local WarnPath = "\t" .. FilePath
    local WarnFunc = nil

    local AddQuota = ( type(Expected) == "string" ) and "\"" or ""
    local WarnArg = "\t" .. AddQuota .. tostring(Value) .. AddQuota .. " (" .. type(Value) .. ")"

    for _, entry in ipairs(FuncMatchRegEx) do
        local pattern, captureIndex = entry[1], entry[2]
        local results = { string.match(Line, pattern) }
        if results[captureIndex] then
            WarnFunc = results[captureIndex]
            break
        end
    end

    WarnFunc = "\t" .. (WarnFunc or "Unknown") .. "(...)"
    Expected = "\t" .. Expected

    MsgC(COLOR_PREFIX, STRING_PREFIX, COLOR_YELLOW,
    "========  ErrorHandling Warning  ========\n")
    MsgC(COLOR_WHITE, "- Warning found in: ",   COLOR_YELLOW, WarnPath, "\n")
    MsgC(COLOR_WHITE, "- In the line: ",        COLOR_YELLOW, WarnLine, "\n")
    MsgC(COLOR_WHITE, "- In the function: ",    COLOR_YELLOW, WarnFunc, "\n\n")
    MsgC(COLOR_WHITE, "- Argument: ",           COLOR_YELLOW, WarnArg, "\n")
    MsgC(COLOR_WHITE, "- Expected: ",           COLOR_YELLOW, Expected, "\n\n")
    MsgC(COLOR_WHITE, "- Warning Message: ",    COLOR_YELLOW, Message, "\n")
    MsgC(COLOR_PREFIX, STRING_PREFIX, COLOR_YELLOW,
    "========  ErrorHandling Warning  ========\n")
end