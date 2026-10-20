'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the system check installs the Studio plugin through platform-specific paths', () => {
  const main = read('main.js');
  assert.match(main, /robloxLocations\(\{ platform: process\.platform, home: HOME/);
  assert.match(main, /path\.join\(pluginsFolder, 'ForgePlugin\.rbxmx'\)/);
  assert.doesNotMatch(main, /process\.env\.LOCALAPPDATA \+ '\\\\Roblox'/);
  assert.match(main, /requirement === 'roblox' && process\.platform === 'darwin'/);
  assert.match(main, /if \(process\.platform !== 'darwin'\) win\.setMenu\(null\)/);
});

test('macOS gets native terminal, runtime, setup and release paths', () => {
  const main = read('main.js');
  const pkg = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/build.yml');
  const setup = read('scripts/setup-macos.sh');
  assert.match(main, /process\.platform === 'win32'[\s\S]*process\.env\.SHELL \|\| 'bash'/);
  assert.match(main, /macPathCandidates\(HOME\)/);
  assert.match(pkg.scripts['runtime:prepare:mac'], /node-darwin|prepare-node-runtime\.py --all-macos/);
  assert.match(pkg.scripts['dist:mac:release'], /notarize=true/);
  assert.match(workflow, /npm run runtime:prepare:mac/);
  assert.match(workflow, /APPLE_API_KEY_ID/);
  assert.match(workflow, /codesign --verify --deep --strict/);
  assert.match(workflow, /xcrun stapler validate/);
  assert.match(workflow, /prerelease: \$\{\{ contains\(github\.ref_name, '-'\) \}\}/);
  assert.match(setup, /Documents\/Roblox\/Plugins/);
  assert.match(setup, /electron-rebuild -f -w node-pty/);
});

test('macOS packaging never includes the Windows-only Python runtime', () => {
  const pkg = JSON.parse(read('package.json'));
  const macResources = JSON.stringify(pkg.build.mac.extraResources);
  const winResources = JSON.stringify(pkg.build.win.extraResources);
  assert.doesNotMatch(macResources, /python-win|node-win/);
  assert.match(winResources, /python-win-x64-u2net/);
  assert.match(macResources, /node-darwin-arm64/);
  assert.match(macResources, /node-darwin-x64/);
  assert.equal(pkg.build.mac.hardenedRuntime, true);
  assert.deepEqual(pkg.build.mac.binaries, [
    'Resources/runtimes/node-darwin-arm64/bin/node',
    'Resources/runtimes/node-darwin-x64/bin/node',
  ]);
});
