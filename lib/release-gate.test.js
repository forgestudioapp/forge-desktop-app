'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspectReleaseInputs, pluginVersion, hashArtifacts } = require('../scripts/release-gate.cjs');

test('la barrière retrouve les entrées réelles de la livraison lorsque les runtimes sont préparés', t => {
  const runtime = path.resolve(__dirname, '../runtimes/node-win-x64/node.exe');
  if (!fs.existsSync(runtime)) return t.skip('npm run runtime:prepare requis');
  const result = inspectReleaseInputs();
  assert.equal(result.ok, true, result.failures.join('\n'));
  assert.match(result.version, /^\d+\.\d+\.\d+/);
});

test('la version du plugin et les sommes des installateurs sont déterministes', t => {
  assert.equal(pluginVersion('local CURRENT_VERSION = "2.3.5-forge.1"'), '2.3.5-forge.1');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-release-gate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'Forge.exe'), 'installer');
  fs.writeFileSync(path.join(dir, 'ignore.txt'), 'ignore');
  const manifestPath = path.join(dir, 'checksums.json');
  const manifest = hashArtifacts(dir, manifestPath);
  assert.equal(manifest.files.length, 1);
  assert.equal(manifest.files[0].name, 'Forge.exe');
  assert.match(manifest.files[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).files[0].sha256, manifest.files[0].sha256);
});

test('la livraison Windows signe les modules natifs du terminal', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  assert.ok(pkg.build.win.signExts.includes('.node'));
  assert.ok(pkg.build.win.signExts.includes('.dll'));
  assert.match(pkg.scripts['rebuild:pty'], /sign-node-pty\.ps1/);
});

test('la livraison macOS produit DMG et ZIP pour Apple Silicon et Intel', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  assert.deepEqual(pkg.build.mac.target, ['dmg', 'zip']);
  assert.match(pkg.scripts['dist:mac'], /--arm64 --x64/);
  assert.match(pkg.scripts['runtime:prepare:mac'], /--all-macos/);
  const resources = pkg.build.mac.extraResources.map(entry => entry.from);
  assert.ok(resources.includes('runtimes/node-darwin-arm64'));
  assert.ok(resources.includes('runtimes/node-darwin-x64'));
  assert.equal(pkg.build.beforePack, './scripts/verify-packaged-runtimes.cjs');
});
