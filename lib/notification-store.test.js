const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  readNotifications,
  appendNotification,
  updateNotification,
  deleteNotification,
} = require('./notification-store');

test('conserve une notification média entre deux pages', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-notifications-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'notifications.json');

  const created = appendNotification(file, {
    agentName: 'Codex',
    aiMessage: '<strong>Icône de jeu prête</strong>',
    assetType: 'image',
    filePath: 'C:\\game\\icons\\icon.png',
    fileName: 'icon.png',
    previewPath: 'C:\\game\\models\\icon-preview.png',
  }, 1234);

  assert.equal(readNotifications(file).length, 1);
  assert.equal(readNotifications(file)[0].id, created.id);
  assert.equal(readNotifications(file)[0].read, false);
  assert.equal(readNotifications(file)[0].previewPath, 'C:\\game\\models\\icon-preview.png');
  assert.equal(updateNotification(file, created.id, { read: true }), true);
  assert.equal(readNotifications(file)[0].read, true);
  assert.equal(deleteNotification(file, created.id), true);
  assert.deepEqual(readNotifications(file), []);
});

test('un fichier de notifications invalide ne bloque pas Forge', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-notifications-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'notifications.json');
  fs.writeFileSync(file, '{invalide');
  assert.deepEqual(readNotifications(file), []);
});

test('watcher, fin média et réexport actualisent une seule carte de modèle', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-notifications-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'notifications.json');
  const model = path.join(dir, 'models', 'nimbo-monster');
  const first = appendNotification(file, { assetType: 'model', filePath: model + '.glb' }, 100);
  updateNotification(file, first.id, { read: true });
  const next = appendNotification(file, { assetType: 'model3d', filePath: model + '.fbx', previewPath: model + '-preview.png' }, 200);
  const late = appendNotification(file, { assetType: 'model', filePath: model + '.glb' }, 300);
  assert.equal(next.id, first.id);
  assert.equal(late.filePath, model + '.fbx');
  assert.equal(late.previewPath, model + '-preview.png');
  assert.equal(late.timestamp, 100);
  assert.equal(late.read, true);
  assert.equal(readNotifications(file).length, 1);
  appendNotification(file, { assetType: 'model3d', filePath: path.join(dir, 'other-project', 'nimbo-monster.fbx') });
  assert.equal(readNotifications(file).length, 2);
});
