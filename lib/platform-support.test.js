'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const support = require('./platform-support');

test('macOS uses its native Node runtime and user Roblox plugin folder', () => {
  assert.equal(support.nodeRuntimeExecutable('/Forge', 'darwin', 'arm64'), '/Forge/runtimes/node-darwin-arm64/bin/node');
  assert.equal(support.nodeRuntimeExecutable('/Forge', 'darwin', 'x64'), '/Forge/runtimes/node-darwin-x64/bin/node');
  const locations = support.robloxLocations({ platform: 'darwin', home: '/Users/max' });
  assert.deepEqual(locations.studioCandidates, ['/Applications/RobloxStudio.app', '/Users/max/Applications/RobloxStudio.app']);
  assert.equal(locations.pluginsDir, '/Users/max/Documents/Roblox/Plugins');
  assert.equal(support.memoryMcpExecutable('darwin'), 'codebase-memory-mcp');
});

test('Windows paths remain compatible and PATH merging removes duplicates', () => {
  const locations = support.robloxLocations({ platform: 'win32', home: 'C:\\Users\\max', localAppData: 'C:\\Users\\max\\AppData\\Local' });
  assert.equal(locations.pluginsDir, path.win32.join('C:\\Users\\max\\AppData\\Local', 'Roblox', 'Plugins'));
  const env = { Path: 'C:\\Node;C:\\Tools', PATH: 'C:\\Tools' };
  support.mergePath(env, ['C:\\Forge', 'C:\\Node'], 'win32');
  assert.equal(env.PATH, 'C:\\Forge;C:\\Node;C:\\Tools');
  assert.equal(env.Path, undefined);
});

test('macOS PATH includes Homebrew and user CLI locations before the inherited PATH', () => {
  const env = { PATH: '/usr/bin:/bin' };
  support.mergePath(env, support.macPathCandidates('/Users/max'), 'darwin');
  assert.equal(env.PATH.split(':')[0], '/opt/homebrew/bin');
  assert.ok(env.PATH.includes('/Users/max/.local/bin'));
  assert.ok(env.PATH.endsWith('/usr/bin:/bin'));
});
