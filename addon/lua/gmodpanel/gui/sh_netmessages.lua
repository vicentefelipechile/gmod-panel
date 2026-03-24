--[[--------------------------------------------------------------------
    gui/sh_netmessages.lua
    Net message declarations shared between server and client.
    All GModPanel net messages are declared here.
--------------------------------------------------------------------]]--

--[[--------------------------------------------------------------------
    Net Message Declarations
--------------------------------------------------------------------]]--

util.AddNetworkString("GModPanel_SetupCode")
util.AddNetworkString("GModPanel_SetupComplete")
util.AddNetworkString("GModPanel_StatusUpdate")

--[[--------------------------------------------------------------------
    Receivers
--------------------------------------------------------------------]]--

-- (client-side receivers are in cl_setup.lua and cl_status.lua)
