'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspectPackage } = require('../scripts/validate-packaged-windows.cjs');

test('packaged Windows audit requires private runtimes, MCP, plugin, native PTY and current installer', t => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-package-')); t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  const root = path.join(dist, 'win-unpacked');
  const files = ['Forge.exe','resources/app.asar','resources/ForgePlugin.rbxmx','resources/runtimes/node-win-x64/node.exe','resources/runtimes/node-win-x64/integrity.json','resources/runtimes/python-win-x64-u2net/python.exe','resources/runtimes/python-win-x64-u2net/integrity.json','resources/robloxstudio-mcp/dist/index.js','resources/robloxstudio-mcp/package.json','resources/app.asar.unpacked/node_modules/node-pty/bin/win32-x64-128/node-pty.node'];
  for (const relative of files) { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.alloc(relative.endsWith('.json') ? 32 : 2048)); }
  fs.writeFileSync(path.join(dist, 'Forge Setup 1.6.0.exe'), Buffer.alloc(1024 * 1024));
  assert.equal(inspectPackage(root, '1.6.0').ok, true);
  fs.rmSync(path.join(root, 'resources/runtimes/node-win-x64/node.exe'));
  assert.match(inspectPackage(root, '1.6.0').failures.join('\n'), /node\.exe/);
});
