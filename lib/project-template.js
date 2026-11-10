'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { writeAdminScaffold } = require('./admin-scaffold');

const MODULES = Object.freeze(['config', 'data', 'currency', 'network', 'notifications', 'admin', 'purchases', 'ui', 'tests']);
const RECOMMENDED_MODULES = Object.freeze(['config', 'data', 'network', 'notifications', 'ui', 'tests', 'admin']);
const PRESETS = Object.freeze({ empty: [], base: ['config', 'network', 'notifications', 'ui', 'tests'], complete: MODULES, recommended: RECOMMENDED_MODULES });

function selection(preset = 'base', modules) {
  if (!Object.hasOwn(PRESETS, preset)) throw new Error('Modèle de projet inconnu.');
  if (modules === undefined) return [...PRESETS[preset]];
  if (!Array.isArray(modules) || modules.some(item => !MODULES.includes(item))) throw new Error('Module de projet inconnu.');
  return [...new Set(modules)];
}

const LUA = {
  config: {
    'ReplicatedStorage/ForgeModules/Config.lua': `-- Configuration indépendante du style visuel.
return { maxCoins = 1000000, notificationLimit = 180 }
`,
  },
  data: {
    'ServerScriptService/ForgeModules/PlayerData.server.lua': `--!strict
-- Données serveur. Les achats doivent rester idempotents et être testés en place publiée.
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("ForgePlayerData_v1")
local function key(player: Player): string return "player_" .. player.UserId end
local function load(player: Player)
  local ok, value = pcall(function() return store:GetAsync(key(player)) end)
  if not ok then warn("[Forge Data] chargement impossible", value) return end
  if type(value) == "table" and type(value.coins) == "number" then
    player:SetAttribute("ForgeCoins", math.max(0, math.floor(value.coins)))
  end
  player:SetAttribute("ForgeDataLoaded", true)
end
local function save(player: Player)
  if player:GetAttribute("ForgeDataLoaded") ~= true then return end
  local coins = player:GetAttribute("ForgeCoins")
  local value = { coins = type(coins) == "number" and math.max(0, math.floor(coins)) or 0 }
  local ok, err = pcall(function() store:UpdateAsync(key(player), function() return value end) end)
  if not ok then warn("[Forge Data] sauvegarde impossible", err) end
end
Players.PlayerAdded:Connect(load)
Players.PlayerRemoving:Connect(save)
for _, player in Players:GetPlayers() do task.spawn(load, player) end
game:BindToClose(function() for _, player in Players:GetPlayers() do save(player) end end)
`,
  },
  currency: {
    'ServerScriptService/ForgeModules/Currency.lua': `--!strict
-- API serveur uniquement. Aucun RemoteEvent n'accorde de monnaie au client.
local Currency = {}
function Currency.grant(player: Player, amount: number): boolean
  if type(amount) ~= "number" or amount ~= amount or amount <= 0 or amount > 100000 then return false end
  local current = player:GetAttribute("ForgeCoins")
  player:SetAttribute("ForgeCoins", math.clamp((type(current) == "number" and current or 0) + math.floor(amount), 0, 1000000))
  return true
end
return Currency
`,
    'ServerScriptService/ForgeModules/Currency.server.lua': `local Players = game:GetService("Players")
local function prepare(player)
  if player:GetAttribute("ForgeCoins") == nil then player:SetAttribute("ForgeCoins", 0) end
end
Players.PlayerAdded:Connect(prepare)
for _, player in Players:GetPlayers() do prepare(player) end
`,
  },
  network: {
    'ServerScriptService/ForgeModules/SecureNetwork.lua': `--!strict
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local remote = Instance.new("RemoteEvent")
remote.Name = "ForgeRequest"
remote.Parent = ReplicatedStorage
local handlers: {[string]: (Player, string) -> ()} = {}
local lastCall: {[Player]: number} = {}
local Network = {}
function Network.register(action: string, handler: (Player, string) -> ())
  assert(#action > 0 and #action <= 40)
  handlers[action] = handler
end
remote.OnServerEvent:Connect(function(player: Player, action: any, payload: any)
  if type(action) ~= "string" or type(payload) ~= "string" or #payload > 1024 then return end
  local now = os.clock()
  if lastCall[player] and now - lastCall[player] < 0.1 then return end
  lastCall[player] = now
  local handler = handlers[action]
  if handler then
    local ok, err = pcall(handler, player, payload)
    if not ok then warn("[Forge Network]", err) end
  end
end)
game:GetService("Players").PlayerRemoving:Connect(function(player) lastCall[player] = nil end)
return Network
`,
    'ServerScriptService/ForgeModules/SecureNetwork.server.lua': `require(script.Parent.SecureNetwork)
`,
    'ReplicatedStorage/ForgeModules/NetworkClient.lua': `local remote = game:GetService("ReplicatedStorage"):WaitForChild("ForgeRequest")
return function(action: string, payload: string?)
  assert(type(action) == "string" and #action <= 40)
  remote:FireServer(action, payload or "")
end
`,
  },
  notifications: {
    'ServerScriptService/ForgeModules/Notifications.lua': `--!strict
local remote = Instance.new("RemoteEvent")
remote.Name = "ForgeNotification"
remote.Parent = game:GetService("ReplicatedStorage")
local Notifications = {}
function Notifications.send(player: Player, text: string): boolean
  if type(text) ~= "string" or #text == 0 or #text > 180 then return false end
  remote:FireClient(player, text)
  return true
end
return Notifications
`,
    'ServerScriptService/ForgeModules/Notifications.server.lua': `require(script.Parent.Notifications)
`,
    'ReplicatedStorage/ForgeModules/NotificationClient.lua': `local remote = game:GetService("ReplicatedStorage"):WaitForChild("ForgeNotification")
return function(callback: (string) -> ())
  return remote.OnClientEvent:Connect(callback)
end
`,
  },
  purchases: {
    'ServerScriptService/ForgeModules/Purchases.server.lua': `--!strict
-- Enregistre les ProductId et des handlers idempotents côté serveur avant de vendre.
local MarketplaceService = game:GetService("MarketplaceService")
local DataStoreService = game:GetService("DataStoreService")
local receipts = DataStoreService:GetDataStore("ForgeReceipts_v1")
local handlers: {[number]: (number, string) -> boolean} = {}
-- Exemple : handlers[123456] = function(userId, purchaseId) return grantOnce(userId, purchaseId) end
MarketplaceService.ProcessReceipt = function(info)
  local handler = handlers[info.ProductId]
  if not handler or type(info.PurchaseId) ~= "string" then return Enum.ProductPurchaseDecision.NotProcessedYet end
  local key = "receipt_" .. info.PurchaseId
  local readOk, processed = pcall(function() return receipts:GetAsync(key) end)
  if not readOk then return Enum.ProductPurchaseDecision.NotProcessedYet end
  if processed == true then return Enum.ProductPurchaseDecision.PurchaseGranted end
  local ok, granted = pcall(handler, info.PlayerId, info.PurchaseId)
  if not ok or granted ~= true then return Enum.ProductPurchaseDecision.NotProcessedYet end
  local saveOk = pcall(function() receipts:SetAsync(key, true) end)
  if not saveOk then return Enum.ProductPurchaseDecision.NotProcessedYet end
  return Enum.ProductPurchaseDecision.PurchaseGranted
end
`,
  },
  ui: {
    'StarterPlayer/StarterPlayerScripts/ForgeUI.client.lua': `-- Point d'entrée UI neutre : ajoute tes composants sans style imposé.
local player = game:GetService("Players").LocalPlayer
local gui = Instance.new("ScreenGui")
gui.Name = "ForgeUIRoot"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")
`,
  },
};

const TS = {
  config: { 'ReplicatedStorage/ForgeModules/Config.ts': `export const Config = { notificationLimit: 180, requestCooldownSeconds: 0.1, maxRequestBytes: 1024 } as const;\n` },
  data: { 'ServerScriptService/ForgeModules/PlayerData.server.ts': `const Players = game.GetService("Players");\nconst store = game.GetService("DataStoreService").GetDataStore("ForgePlayerData_v1");\nfunction key(player: Player) { return "player_" + player.UserId; }\nfunction load(player: Player) { try { const value = store.GetAsync(key(player)) as { visits?: number } | undefined; const visits = value && typeIs(value.visits, "number") ? value.visits : 0; player.SetAttribute("ForgeVisits", math.max(0, math.floor(visits)) + 1); player.SetAttribute("ForgeDataLoaded", true); } catch (error) { warn("[Forge Data] load failed", error); } }\nfunction save(player: Player) { if (player.GetAttribute("ForgeDataLoaded") !== true) return; const visits = player.GetAttribute("ForgeVisits"); try { store.UpdateAsync(key(player), () => $tuple({ visits: typeIs(visits, "number") ? math.max(0, math.floor(visits)) : 0 })); } catch (error) { warn("[Forge Data] save failed", error); } }\nPlayers.PlayerAdded.Connect(load); Players.PlayerRemoving.Connect(save); Players.GetPlayers().forEach(player => task.spawn(() => load(player))); game.BindToClose(() => Players.GetPlayers().forEach(save));\n` },
  currency: { 'ServerScriptService/ForgeModules/Currency.ts': `export function grantCoins(player: Player, amount: number): boolean { if (amount !== amount || amount <= 0 || amount > 100000) return false; const value = player.GetAttribute("ForgeCoins"); player.SetAttribute("ForgeCoins", math.clamp((typeIs(value, "number") ? value : 0) + math.floor(amount), 0, 1000000)); return true; }\n`, 'ServerScriptService/ForgeModules/Currency.server.ts': `const Players = game.GetService("Players");\nfunction prepare(player: Player) { if (player.GetAttribute("ForgeCoins") === undefined) player.SetAttribute("ForgeCoins", 0); }\nPlayers.PlayerAdded.Connect(prepare); Players.GetPlayers().forEach(prepare);\n` },
  network: { 'ServerScriptService/ForgeModules/SecureNetwork.ts': `const remote = new Instance("RemoteEvent"); remote.Name = "ForgeRequest"; remote.Parent = game.GetService("ReplicatedStorage");\nconst handlers = new Map<string, (player: Player, payload: string) => void>();\nconst lastCall = new Map<Player, number>();\nexport function registerNetworkAction(action: string, handler: (player: Player, payload: string) => void) { assert(action.size() > 0 && action.size() <= 40); handlers.set(action, handler); }\nremote.OnServerEvent.Connect((player, action: unknown, payload: unknown) => { if (!typeIs(action, "string") || !typeIs(payload, "string") || payload.size() > 1024) return; const now = os.clock(); const previous = lastCall.get(player); if (previous !== undefined && now - previous < 0.1) return; lastCall.set(player, now); const handler = handlers.get(action); if (handler) { try { handler(player, payload); } catch (error) { warn("[Forge Network]", error); } } });\ngame.GetService("Players").PlayerRemoving.Connect(player => lastCall.delete(player));\n`, 'ServerScriptService/ForgeModules/SecureNetwork.server.ts': `import "./SecureNetwork";\n`, 'ReplicatedStorage/ForgeModules/NetworkClient.ts': `const remote = game.GetService("ReplicatedStorage").WaitForChild("ForgeRequest") as RemoteEvent;\nexport function sendRequest(action: string, payload = "") { assert(action.size() <= 40); remote.FireServer(action, payload); }\n` },
  notifications: { 'ServerScriptService/ForgeModules/Notifications.ts': `const remote = new Instance("RemoteEvent"); remote.Name = "ForgeNotification"; remote.Parent = game.GetService("ReplicatedStorage");\nexport function sendNotification(player: Player, text: string): boolean { if (text.size() === 0 || text.size() > 180) return false; remote.FireClient(player, text); return true; }\n`, 'ServerScriptService/ForgeModules/Notifications.server.ts': `import "./Notifications";\n`, 'ReplicatedStorage/ForgeModules/NotificationClient.ts': `const remote = game.GetService("ReplicatedStorage").WaitForChild("ForgeNotification") as RemoteEvent;\nexport function subscribeNotification(callback: (message: string) => void): RBXScriptConnection { return remote.OnClientEvent.Connect(callback); }\n` },
  ui: { 'StarterPlayer/StarterPlayerScripts/ForgeUI.client.ts': `const player = game.GetService("Players").LocalPlayer;\nconst gui = new Instance("ScreenGui"); gui.Name = "ForgeUIRoot"; gui.ResetOnSpawn = false; gui.Parent = player.WaitForChild("PlayerGui");\n` },
};

function writeProjectTemplate(projectPath, { language = 'lua', preset = 'base', modules, projectName = 'ForgeProject' } = {}) {
  const selected = selection(preset, modules);
  const source = language === 'typescript' ? TS : LUA;
  const written = [];
  for (const moduleName of selected) {
    if (moduleName === 'admin') {
      writeAdminScaffold(projectPath, 0, { basicCommands: true, headless: true });
      written.push('src/ReplicatedStorage/ForgeAdmin/Commands.lua', 'src/ServerScriptService/ForgeAdmin.server.lua');
      continue;
    }
    if (moduleName === 'tests') continue;
    for (const [relative, content] of Object.entries(source[moduleName] || LUA[moduleName] || {})) {
      const target = path.join(projectPath, 'src', ...relative.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, { flag: 'wx' });
      written.push(path.relative(projectPath, target).replace(/\\/g, '/'));
    }
  }
  const manifest = { version: 1, preset, language, modules: selected, createdAt: new Date().toISOString(), files: written };
  const forgeDir = path.join(projectPath, '.forge'); fs.mkdirSync(forgeDir, { recursive: true });
  fs.writeFileSync(path.join(forgeDir, 'template.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  const docs = [`# ${projectName}`, '', `Langage : ${language === 'typescript' ? 'TypeScript' : 'Luau'}. Modèle : ${preset}.`, '', 'Modules installés : ' + (selected.join(', ') || 'aucun') + '.', '', 'src/ServerScriptService : serveur ; src/StarterPlayer : client ; src/ReplicatedStorage : partagé.', 'Réseau : enregistre des actions serveur avant de recevoir les messages client. Les messages inconnus, trop longs ou trop rapides sont ignorés.', selected.includes('data') ? 'Données : sauvegarde générique des visites ; active les API Studio et teste la sauvegarde dans une place de test publiée.' : 'Données : aucun stockage installé.', selected.includes('admin') ? 'Administrateur : commandes réservées au créateur de la place ; ajoute une interface propre à ton jeu si nécessaire.' : 'Administrateur : aucun système installé.', selected.includes('purchases') ? 'Achats : aucun ProductId ni récompense n’est configuré. Les handlers doivent être idempotents par PurchaseId avant la vente.' : 'Achats Roblox : à ajouter seulement si le jeu en a besoin.', 'Notifications et UI : transport et point d’entrée seulement, sans style graphique imposé.', 'Tests : lance node tests/smoke.cjs si le module tests est sélectionné, puis un playtest Studio après la première synchronisation.', 'Le dossier .forge/template.json contient le choix initial. Forge ne convertit pas les projets existants.', preset === 'recommended' ? 'Forge détecte la place Studio, demande confirmation puis vérifie la première synchronisation. Effectue un playtest avant de publier.' : 'Associe une place puis active la synchronisation dans les réglages. Vérifie le PlaceId et un playtest avant de publier.', ''];
  fs.writeFileSync(path.join(projectPath, 'README.md'), docs.join('\n'), { flag: 'wx' });
  if (selected.includes('tests')) {
    const testsDir = path.join(projectPath, 'tests'); fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(path.join(testsDir, 'smoke.cjs'), `const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const root=path.join(__dirname,'..');const manifest=require('../.forge/template.json');for(const file of manifest.files)assert.ok(fs.existsSync(path.join(root,file)),file);console.log('Forge template: '+manifest.files.length+' fichiers vérifiés.');\n`, { flag: 'wx' });
  }
  return manifest;
}

module.exports = { MODULES, PRESETS, RECOMMENDED_MODULES, selection, writeProjectTemplate };
