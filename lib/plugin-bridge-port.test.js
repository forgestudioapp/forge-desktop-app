const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the bundled Studio plugin discovers the primary bridge port opened by Forge', () => {
  const plugin = fs.readFileSync(path.join(__dirname, '..', 'ForgePlugin.rbxmx'), 'utf8');
  const bridge = fs.readFileSync(path.join(__dirname, '..', '..', 'robloxstudio-mcp', 'src', 'index.ts'), 'utf8');
  const pluginPort = plugin.match(/local BASE_PORT = (\d+)/);
  const bridgePort = bridge.match(/const basePort = process\.env\.ROBLOX_STUDIO_PORT \? parseInt\(process\.env\.ROBLOX_STUDIO_PORT\) : (\d+)/);
  assert.ok(pluginPort, 'plugin BASE_PORT missing');
  assert.ok(bridgePort, 'bridge default base port missing');
  assert.equal(pluginPort[1], bridgePort[1]);
  assert.match(plugin, new RegExp(`urlInput\\.Text = "http://localhost:${bridgePort[1]}"`));
});
