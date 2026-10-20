'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareUpdateSnapshot, restoreUpdateSnapshot } = require('./update-snapshot');

function temp(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-update-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }

test('first launch records the version without inventing an upgrade snapshot', t => {
  const dir = temp(t);
  const result = prepareUpdateSnapshot({ userDataDir: dir, currentVersion: '1.6.0', now: new Date('2026-10-20T10:00:00Z') });
  assert.equal(result.changed, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'forge-version-state.json'))).version, '1.6.0');
  assert.equal(fs.existsSync(path.join(dir, 'update-snapshots')), false);
});

test('version change snapshots projects, preferences, protected values and drafts before startup', t => {
  const dir = temp(t);
  prepareUpdateSnapshot({ userDataDir: dir, currentVersion: '1.5.9' });
  fs.writeFileSync(path.join(dir, 'projects-registry.json'), '[{"name":"Jeu","path":"C:/Jeu"}]');
  fs.writeFileSync(path.join(dir, 'forge-settings.json'), '{"theme":"dark"}');
  fs.writeFileSync(path.join(dir, 'forge-session.json'), '{"version":1,"protection":"electron-safe-storage","payload":"encrypted"}');
  fs.writeFileSync(path.join(dir, 'agents-state.json'), '{"draft":"ne pas perdre"}');
  const result = prepareUpdateSnapshot({ userDataDir: dir, currentVersion: '1.6.0', now: new Date('2026-10-20T10:00:00Z') });
  assert.equal(result.changed, true);
  assert.deepEqual(result.files, ['agents-state.json', 'forge-session.json', 'forge-settings.json', 'projects-registry.json']);
  const manifest = JSON.parse(fs.readFileSync(path.join(result.snapshotDir, 'snapshot-manifest.json')));
  assert.equal(manifest.fromVersion, '1.5.9');
  assert.equal(manifest.toVersion, '1.6.0');
  assert.equal(manifest.files.length, 4);
});

test('first version-aware launch preserves data created by an older unversioned Forge release', t => {
  const dir = temp(t);
  fs.writeFileSync(path.join(dir, 'projects-registry.json'), '[{"name":"Ancien","path":"C:/Ancien"}]');
  const result = prepareUpdateSnapshot({ userDataDir: dir, currentVersion: '1.6.0', now: new Date('2026-10-20T10:00:00Z') });
  assert.equal(result.changed, true);
  const manifest = JSON.parse(fs.readFileSync(path.join(result.snapshotDir, 'snapshot-manifest.json')));
  assert.equal(manifest.fromVersion, 'legacy-unversioned');
  assert.deepEqual(manifest.files.map(item => item.relative), ['projects-registry.json']);
});

test('verified snapshot restores the preserved data and refuses a modified file', t => {
  const dir = temp(t);
  prepareUpdateSnapshot({ userDataDir: dir, currentVersion: '1.5.9' });
  fs.writeFileSync(path.join(dir, 'forge-settings.json'), '{"theme":"dark"}');
  const result = prepareUpdateSnapshot({ userDataDir: dir, currentVersion: '1.6.0' });
  fs.writeFileSync(path.join(dir, 'forge-settings.json'), '{"theme":"light"}');
  assert.equal(restoreUpdateSnapshot({ userDataDir: dir, snapshotDir: result.snapshotDir }).restored, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'forge-settings.json'), 'utf8'), '{"theme":"dark"}');
  fs.writeFileSync(path.join(result.snapshotDir, 'forge-settings.json'), 'tampered');
  assert.throws(() => restoreUpdateSnapshot({ userDataDir: dir, snapshotDir: result.snapshotDir }), /altérée/);
});
