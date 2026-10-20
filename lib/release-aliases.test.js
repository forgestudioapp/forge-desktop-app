'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createReleaseAliases } = require('../scripts/create-release-aliases.cjs');

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-release-alias-'));
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), value);
  return dir;
}

test('creates the permanent Windows website download without changing the versioned installer', () => {
  const dir = fixture({ 'Forge Setup 1.6.0.exe': 'signed-windows-installer' });
  const [result] = createReleaseAliases(dir, 'windows');
  assert.equal(result.aliasName, 'Forge-Windows-x64.exe');
  assert.equal(fs.readFileSync(path.join(dir, result.aliasName), 'utf8'), 'signed-windows-installer');
  assert.equal(fs.readFileSync(path.join(dir, result.sourceName), 'utf8'), 'signed-windows-installer');
});

test('creates stable Apple Silicon and Intel website downloads', () => {
  const dir = fixture({
    'Forge-1.6.0-mac-arm64.dmg': 'signed-arm64-dmg',
    'Forge-1.6.0-mac-x64.dmg': 'signed-x64-dmg',
    'Forge-1.6.0-mac-arm64.zip': 'updater-arm64',
  });
  const results = createReleaseAliases(dir, 'macos');
  assert.deepEqual(results.map(item => item.aliasName), ['Forge-macOS-arm64.dmg', 'Forge-macOS-x64.dmg']);
  assert.equal(fs.readFileSync(path.join(dir, 'Forge-macOS-arm64.dmg'), 'utf8'), 'signed-arm64-dmg');
  assert.equal(fs.readFileSync(path.join(dir, 'Forge-macOS-x64.dmg'), 'utf8'), 'signed-x64-dmg');
});

test('refuses an incomplete or ambiguous release instead of linking the wrong installer', () => {
  assert.throws(() => createReleaseAliases(fixture({ 'Forge-1.6.0-mac-arm64.dmg': 'arm' }), 'macos'), /x64.*aucun/i);
  assert.throws(() => createReleaseAliases(fixture({ 'a.exe': 'a', 'b.exe': 'b' }), 'windows'), /2 fichier/);
});
