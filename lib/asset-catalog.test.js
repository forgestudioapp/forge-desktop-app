const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readCatalog, recordAssetFile, updateAsset, publishAsset, discoverLocalAssets } = require('./asset-catalog');

function fixture(t, extension = '.png') {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ForgeAsset_'));
  const file = path.join(project, 'assets', `sample${extension}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'first revision');
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  return { project, file };
}

test('creates a local image draft with attribution and an immutable revision', t => {
  const { project, file } = fixture(t);
  const asset = recordAssetFile(project, { filePath: file, status: 'draft', agent: 'Codex', prompt: 'Blue icon', provider: 'Codex', cost: 0.5 });
  assert.equal(asset.status, 'draft');
  assert.equal(asset.type, 'image');
  assert.equal(asset.agent, 'Codex');
  assert.equal(asset.cost, 0.5);
  assert.equal(asset.revisions.length, 1);
  assert.equal(fs.readFileSync(path.join(project, asset.revisions[0].snapshot), 'utf8'), 'first revision');
});

test('redo retains the prior file and history, then attaches a new model revision', t => {
  const { project, file } = fixture(t, '.fbx');
  const first = recordAssetFile(project, { filePath: file, type: 'model3d' });
  updateAsset(project, first.id, 'redo', { prompt: 'More detail' });
  assert.equal(readCatalog(project).assets[0].status, 'in-progress');
  fs.writeFileSync(file, 'second revision');
  const second = recordAssetFile(project, { assetId: first.id, filePath: file, type: 'model3d', prompt: 'More detail' });
  assert.equal(second.revisions.length, 2);
  assert.equal(second.revisions[1].status, 'needs-review');
  assert.equal(fs.readFileSync(path.join(project, second.revisions[0].snapshot), 'utf8'), 'first revision');
  assert.equal(fs.readFileSync(file, 'utf8'), 'second revision');
});

test('rejecting an asset keeps its file and revision', t => {
  const { project, file } = fixture(t);
  const asset = recordAssetFile(project, { filePath: file });
  const rejected = updateAsset(project, asset.id, 'reject');
  assert.equal(rejected.status, 'rejected');
  assert.equal(fs.existsSync(file), true);
  assert.equal(readCatalog(project).assets[0].revisions.length, 1);
});

test('Roblox upload cannot run before explicit acceptance', async t => {
  const { project, file } = fixture(t);
  const asset = recordAssetFile(project, { filePath: file });
  let calls = 0;
  await assert.rejects(publishAsset(project, asset.id, async () => { calls++; return { assetId: '42' }; }), /Validation explicite/);
  assert.equal(calls, 0);
});

test('validated image publishes and stores Roblox ID', async t => {
  const { project, file } = fixture(t);
  const asset = recordAssetFile(project, { filePath: file });
  updateAsset(project, asset.id, 'accept');
  const published = await publishAsset(project, asset.id, async () => ({ assetId: '123456' }));
  assert.equal(published.status, 'published');
  assert.equal(readCatalog(project).assets[0].robloxAssetId, '123456');
  assert.equal(fs.existsSync(file), true);
});

test('upload failure keeps validated local file and entire history for retry', async t => {
  const { project, file } = fixture(t);
  const first = recordAssetFile(project, { filePath: file });
  updateAsset(project, first.id, 'redo');
  fs.writeFileSync(file, 'second revision');
  recordAssetFile(project, { assetId: first.id, filePath: file });
  updateAsset(project, first.id, 'accept');
  await assert.rejects(publishAsset(project, first.id, async () => ({ error: 'HTTP 500' })), /HTTP 500/);
  const asset = readCatalog(project).assets[0];
  assert.equal(asset.status, 'validated');
  assert.equal(asset.uploadError, 'HTTP 500');
  assert.equal(asset.revisions.length, 2);
  assert.equal(fs.readFileSync(path.join(project, asset.revisions[0].snapshot), 'utf8'), 'first revision');
  assert.equal(fs.readFileSync(file, 'utf8'), 'second revision');
});

test('editing a validated file blocks publication until its next revision is approved', async t => {
  const { project, file } = fixture(t);
  const asset = recordAssetFile(project, { filePath: file });
  updateAsset(project, asset.id, 'accept');
  fs.writeFileSync(file, 'changed after acceptance');
  await assert.rejects(publishAsset(project, asset.id, async () => ({ assetId: '1' })), /fichier a changé/);
});

test('existing local images and models become drafts without deleting their files', t => {
  const { project, file } = fixture(t);
  const model = path.join(project, 'models', 'house.fbx');
  fs.mkdirSync(path.dirname(model)); fs.writeFileSync(model, 'model');
  assert.equal(discoverLocalAssets(project), 2);
  assert.equal(discoverLocalAssets(project), 0);
  assert.deepEqual(readCatalog(project).assets.map(a => a.type).sort(), ['image', 'model3d']);
  assert.equal(fs.existsSync(file), true);
  assert.equal(fs.existsSync(model), true);
});

test('model publication records insertion confirmation only after explicit validation', async t => {
  const { project, file } = fixture(t, '.fbx');
  const asset = recordAssetFile(project, { filePath: file });
  updateAsset(project, asset.id, 'accept');
  const published = await publishAsset(project, asset.id, async () => ({ assetId: '345' }), async () => ({ confirmed: true, placeId: '77' }));
  assert.equal(published.robloxAssetId, '345');
  assert.deepEqual(readCatalog(project).assets[0].insertion, { confirmed: true, placeId: '77' });
});

test('a revision changed during upload is not overwritten by stale publication state', async t => {
  const { project, file } = fixture(t);
  const asset = recordAssetFile(project, { filePath: file });
  updateAsset(project, asset.id, 'accept');
  await assert.rejects(publishAsset(project, asset.id, async () => {
    updateAsset(project, asset.id, 'redo');
    fs.writeFileSync(file, 'new revision');
    recordAssetFile(project, { assetId: asset.id, filePath: file });
    return { assetId: '999' };
  }), /révision a changé/);
  const current = readCatalog(project).assets[0];
  assert.equal(current.status, 'needs-review');
  assert.equal(current.robloxAssetId, null);
  assert.equal(current.revisions.length, 2);
});

test('redo after publication preserves the prior revision Roblox ID', async t => {
  const { project, file } = fixture(t);
  const asset = recordAssetFile(project, { filePath: file });
  updateAsset(project, asset.id, 'accept');
  await publishAsset(project, asset.id, async () => ({ assetId: '5566' }));
  const pending = updateAsset(project, asset.id, 'redo');
  assert.equal(pending.status, 'in-progress');
  assert.equal(pending.robloxAssetId, null);
  assert.equal(pending.revisions[0].robloxAssetId, '5566');
  assert.equal(fs.readFileSync(path.join(project, pending.revisions[0].snapshot), 'utf8'), 'first revision');
});

test('removing an asset from the catalog keeps local files hidden from rediscovery', t => {
  const { project, file } = fixture(t);
  const asset = recordAssetFile(project, { filePath: file });
  updateAsset(project, asset.id, 'delete');
  assert.equal(discoverLocalAssets(project), 0);
  assert.equal(readCatalog(project).assets.length, 0);
  assert.equal(fs.existsSync(file), true);
  assert.equal(fs.existsSync(path.join(project, asset.revisions[0].snapshot)), true);
});
