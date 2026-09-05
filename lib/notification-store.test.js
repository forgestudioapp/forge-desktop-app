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
  }, 1234);

  assert.equal(readNotifications(file).length, 1);
  assert.equal(readNotifications(file)[0].id, created.id);
  assert.equal(readNotifications(file)[0].read, false);
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
