const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const pairing = require('./model-asset-pairing');
const store = require('./notification-store');

test('le watcher réel notifie un modèle, sans publier ses palettes et vues QA', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-watcher-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'models'));
  fs.mkdirSync(path.join(root, 'assets'));
  const notificationPath = path.join(root, 'notifications.json');
  const published = [], events = [], pending = [];
  const context = vm.createContext({
    fs, path, ...pairing, ...store, currentSyncProjectPath: root,
    PTYS: new Map(), console: { log() {} },
    ASSET_EXT_MAP: { fbx: { type: 'model3d', folder: 'models' }, png: { type: 'image', folder: 'assets' } },
    escapeNotificationHtml: s => s,
    forgeNotificationsPath: () => notificationPath,
    broadcastNotification: data => events.push(data),
    emitForgeNotification: data => { const item = store.appendNotification(notificationPath, data); events.push(item); return item; },
    publishToLibrary: async file => { published.push(file); return { success: true }; },
    setTimeout: (fn, delay) => { if (delay === 800 || delay === 5000) pending.push({ fn, delay }); },
  });
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  vm.runInContext(main.slice(main.indexOf('function notifyAssetCreated('), main.indexOf('// Anti double-publication')), context);
  const arrive = async relative => {
    const file = path.join(root, relative);
    fs.writeFileSync(file, 'fixture');
    context.handleNewAssetFile(file, path.basename(file));
    for (const timer of pending.splice(0).sort((a, b) => a.delay - b.delay)) await timer.fn();
    return file;
  };
  await arrive('models/nimbo-palette.png');
  await arrive('models/nimbo-qa-front.png');
  await arrive('models/nimbo-qa-back.png');
  assert.equal(published.length, 0);
  assert.equal(events.length, 0);
  const model = await arrive('models/nimbo-monster.fbx');
  const preview = await arrive('models/nimbo-monster-preview.png');
  await arrive('models/nimbo-monster.fbx');
  assert.equal(store.readNotifications(notificationPath).length, 1);
  assert.equal(new Set(events.map(item => item.id)).size, 1);
  assert.equal(store.readNotifications(notificationPath)[0].previewPath, preview);
  assert.ok(published.every(file => file === model));
  assert.deepEqual(fs.readdirSync(path.join(root, 'assets')), []);
  await arrive('assets/icon.png');
  assert.equal(store.readNotifications(notificationPath).length, 2);
  assert.equal(published.at(-1), path.join(root, 'assets', 'icon.png'));
});
