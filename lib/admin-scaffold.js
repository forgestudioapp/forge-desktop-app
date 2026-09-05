const fs = require('node:fs');
const path = require('node:path');

function normalizeUserId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function buildAdminScripts(userId) {
  const adminUserId = normalizeUserId(userId);

  const commands = `--!strict
-- Forge Admin - registre des commandes propres a ce jeu.
-- Les agents Forge ajoutent les commandes ici avec Commands.register({...}).

export type CommandDefinition = {
\tname: string,
\tdescription: string?,
\trun: (player: Player, args: {string}) -> (boolean?, string?),
}

local Commands = {}
local registry: {[string]: CommandDefinition} = {}

local function normalizeName(name: string): string
\treturn string.lower(string.gsub(name, "^%s*(.-)%s*$", "%1"))
end

function Commands.register(definition: CommandDefinition)
\tassert(type(definition) == "table", "La commande doit etre une table")
\tassert(type(definition.name) == "string" and definition.name ~= "", "La commande doit avoir un nom")
\tassert(type(definition.run) == "function", "La commande doit avoir une fonction run")
\tregistry[normalizeName(definition.name)] = definition
end

function Commands.list()
\tlocal result = {}
\tfor _, command in registry do
\t\ttable.insert(result, {
\t\t\tname = command.name,
\t\t\tdescription = command.description or "",
\t\t})
\tend
\ttable.sort(result, function(a, b)
\t\treturn a.name < b.name
\tend)
\treturn result
end

function Commands.execute(player: Player, name: string, args: {string})
\tlocal command = registry[normalizeName(name)]
\tif not command then
\t\treturn false, "Commande inconnue"
\tend
\treturn command.run(player, args)
end

-- Zone geree par les agents Forge : aucune commande n'est imposee par defaut.

return Commands
`;

  const server = `--!strict
-- Forge Admin - passerelle serveur reservee au proprietaire de ce projet.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local ADMIN_USER_ID = ${adminUserId}
local Commands = require(ReplicatedStorage:WaitForChild("ForgeAdmin"):WaitForChild("Commands"))

local existingRemote = ReplicatedStorage:FindFirstChild("ForgeAdminRequest")
local remote: RemoteFunction
if existingRemote and existingRemote:IsA("RemoteFunction") then
\tremote = existingRemote
else
\tif existingRemote then existingRemote:Destroy() end
\tlocal createdRemote = Instance.new("RemoteFunction")
\tcreatedRemote.Name = "ForgeAdminRequest"
\tcreatedRemote.Parent = ReplicatedStorage
\tremote = createdRemote
end

local function isProjectOwner(player: Player): boolean
\tif ADMIN_USER_ID > 0 then
\t\treturn player.UserId == ADMIN_USER_ID
\tend
\treturn game.CreatorType == Enum.CreatorType.User and player.UserId == game.CreatorId
end

remote.OnServerInvoke = function(player: Player, action: any, payload: any)
\tif not isProjectOwner(player) then
\t\treturn { ok = false, error = "Acces refuse" }
\tend

\tif action == "list" then
\t\treturn { ok = true, commands = Commands.list() }
\tend

\tif action ~= "execute" or type(payload) ~= "table" then
\t\treturn { ok = false, error = "Requete invalide" }
\tend

\tlocal name = payload.name
\tlocal args = payload.args
\tif type(name) ~= "string" or #name > 64 or type(args) ~= "table" or #args > 32 then
\t\treturn { ok = false, error = "Commande invalide" }
\tend
\tfor _, value in args do
\t\tif type(value) ~= "string" or #value > 256 then
\t\t\treturn { ok = false, error = "Arguments invalides" }
\t\tend
\tend

\tlocal succeeded, commandOk, message = pcall(Commands.execute, player, name, args)
\tif not succeeded then
\t\twarn("[Forge Admin] " .. tostring(commandOk))
\t\treturn { ok = false, error = "La commande a rencontre une erreur" }
\tend
\treturn { ok = commandOk ~= false, message = message or (commandOk == false and "Echec" or "Commande executee") }
end

`;

  const client = `--!strict
-- Forge Admin - interface personnelle, ouverte avec F2.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local remote = ReplicatedStorage:WaitForChild("ForgeAdminRequest", 15) :: RemoteFunction?
if not remote then return end

local ok, initial = pcall(function()
\treturn remote:InvokeServer("list")
end)
if not ok or type(initial) ~= "table" or initial.ok ~= true then return end

local gui = Instance.new("ScreenGui")
gui.Name = "ForgeAdmin"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Enabled = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = player:WaitForChild("PlayerGui")

local panel = Instance.new("Frame")
panel.Name = "Panel"
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.Size = UDim2.fromOffset(560, 390)
panel.BackgroundColor3 = Color3.fromRGB(19, 22, 30)
panel.BorderSizePixel = 0
panel.Parent = gui
Instance.new("UICorner", panel).CornerRadius = UDim.new(0, 12)

local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromRGB(59, 130, 246)
stroke.Transparency = 0.35
stroke.Thickness = 1
stroke.Parent = panel

local title = Instance.new("TextLabel")
title.BackgroundTransparency = 1
title.Position = UDim2.fromOffset(22, 16)
title.Size = UDim2.new(1, -44, 0, 34)
title.Font = Enum.Font.GothamBold
title.Text = "FORGE ADMIN"
title.TextColor3 = Color3.fromRGB(241, 245, 249)
title.TextSize = 20
title.TextXAlignment = Enum.TextXAlignment.Left
title.Parent = panel

local hint = Instance.new("TextLabel")
hint.BackgroundTransparency = 1
hint.Position = UDim2.new(1, -100, 0, 20)
hint.Size = UDim2.fromOffset(78, 24)
hint.Font = Enum.Font.GothamMedium
hint.Text = "F2 · fermer"
hint.TextColor3 = Color3.fromRGB(148, 163, 184)
hint.TextSize = 11
hint.TextXAlignment = Enum.TextXAlignment.Right
hint.Parent = panel

local divider = Instance.new("Frame")
divider.Position = UDim2.fromOffset(22, 58)
divider.Size = UDim2.new(1, -44, 0, 1)
divider.BackgroundColor3 = Color3.fromRGB(51, 65, 85)
divider.BorderSizePixel = 0
divider.Parent = panel

local list = Instance.new("ScrollingFrame")
list.Name = "Commands"
list.Position = UDim2.fromOffset(22, 75)
list.Size = UDim2.new(1, -44, 1, -154)
list.BackgroundTransparency = 1
list.BorderSizePixel = 0
list.ScrollBarThickness = 4
list.AutomaticCanvasSize = Enum.AutomaticSize.Y
list.CanvasSize = UDim2.new()
list.Parent = panel

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 8)
layout.Parent = list

local input = Instance.new("TextBox")
input.Position = UDim2.new(0, 22, 1, -59)
input.Size = UDim2.new(1, -142, 0, 40)
input.BackgroundColor3 = Color3.fromRGB(30, 41, 59)
input.BorderSizePixel = 0
input.ClearTextOnFocus = false
input.Font = Enum.Font.Code
input.PlaceholderText = "commande arguments..."
input.PlaceholderColor3 = Color3.fromRGB(100, 116, 139)
input.Text = ""
input.TextColor3 = Color3.fromRGB(226, 232, 240)
input.TextSize = 14
input.TextXAlignment = Enum.TextXAlignment.Left
input.Parent = panel
Instance.new("UICorner", input).CornerRadius = UDim.new(0, 8)

local inputPadding = Instance.new("UIPadding")
inputPadding.PaddingLeft = UDim.new(0, 12)
inputPadding.PaddingRight = UDim.new(0, 12)
inputPadding.Parent = input

local runButton = Instance.new("TextButton")
runButton.Position = UDim2.new(1, -110, 1, -59)
runButton.Size = UDim2.fromOffset(88, 40)
runButton.BackgroundColor3 = Color3.fromRGB(59, 130, 246)
runButton.BorderSizePixel = 0
runButton.Font = Enum.Font.GothamBold
runButton.Text = "Executer"
runButton.TextColor3 = Color3.new(1, 1, 1)
runButton.TextSize = 13
runButton.Parent = panel
Instance.new("UICorner", runButton).CornerRadius = UDim.new(0, 8)

local status = Instance.new("TextLabel")
status.BackgroundTransparency = 1
status.Position = UDim2.new(0, 22, 1, -84)
status.Size = UDim2.new(1, -44, 0, 18)
status.Font = Enum.Font.Gotham
status.Text = ""
status.TextColor3 = Color3.fromRGB(148, 163, 184)
status.TextSize = 11
status.TextXAlignment = Enum.TextXAlignment.Left
status.Parent = panel

local commands = initial.commands or {}
if #commands == 0 then
\tlocal empty = Instance.new("TextLabel")
\tempty.BackgroundTransparency = 1
\tempty.Size = UDim2.new(1, 0, 0, 90)
\tempty.Font = Enum.Font.Gotham
\tempty.Text = "Aucune commande pour le moment.\\nDemande a ton IA Forge d'en creer une pour ce jeu."
\tempty.TextColor3 = Color3.fromRGB(148, 163, 184)
\tempty.TextSize = 14
\tempty.Parent = list
else
\tfor _, command in commands do
\t\tlocal button = Instance.new("TextButton")
\t\tbutton.Size = UDim2.new(1, -6, 0, 48)
\t\tbutton.BackgroundColor3 = Color3.fromRGB(30, 41, 59)
\t\tbutton.BorderSizePixel = 0
\t\tbutton.Font = Enum.Font.GothamMedium
\t\tbutton.Text = command.name .. (command.description ~= "" and "  ·  " .. command.description or "")
\t\tbutton.TextColor3 = Color3.fromRGB(226, 232, 240)
\t\tbutton.TextSize = 13
\t\tbutton.TextXAlignment = Enum.TextXAlignment.Left
\t\tbutton.Parent = list
\t\tInstance.new("UICorner", button).CornerRadius = UDim.new(0, 8)
\t\tlocal padding = Instance.new("UIPadding")
\t\tpadding.PaddingLeft = UDim.new(0, 12)
\t\tpadding.Parent = button
\t\tbutton.Activated:Connect(function()
\t\t\tinput.Text = command.name .. " "
\t\t\tinput:CaptureFocus()
\t\t\tinput.CursorPosition = #input.Text + 1
\t\tend)
\tend
end

local function execute()
\tlocal words = string.split(input.Text, " ")
\tlocal name = table.remove(words, 1)
\tif not name or name == "" then return end
\tlocal success, response = pcall(function()
\t\treturn remote:InvokeServer("execute", { name = name, args = words })
\tend)
\tif success and response and response.ok then
\t\tstatus.TextColor3 = Color3.fromRGB(74, 222, 128)
\t\tstatus.Text = response.message or "Commande executee"
\telse
\t\tstatus.TextColor3 = Color3.fromRGB(248, 113, 113)
\t\tstatus.Text = success and (response.error or "Echec") or "Serveur indisponible"
\tend
end

runButton.Activated:Connect(execute)
input.FocusLost:Connect(function(enterPressed)
\tif enterPressed then execute() end
end)

UserInputService.InputBegan:Connect(function(inputObject)
\tif inputObject.KeyCode == Enum.KeyCode.F2 then
\t\tgui.Enabled = not gui.Enabled
\t\tif gui.Enabled then input:CaptureFocus() end
\tend
end)
`;

  return { commands, server, client, adminUserId };
}

function writeAdminScaffold(projectPath, userId) {
  const scripts = buildAdminScripts(userId);
  const targets = [
    ['ReplicatedStorage', 'ForgeAdmin', 'Commands.lua', scripts.commands],
    ['ServerScriptService', 'ForgeAdmin.server.lua', scripts.server],
    ['StarterPlayer', 'StarterPlayerScripts', 'ForgeAdmin.client.lua', scripts.client],
  ];

  for (const target of targets) {
    const source = target.pop();
    const filePath = path.join(projectPath, 'src', ...target);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, source, 'utf8');
  }

  return { adminUserId: scripts.adminUserId, files: targets.length };
}

module.exports = { normalizeUserId, buildAdminScripts, writeAdminScaffold };
