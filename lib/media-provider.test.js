const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
test('real media handler routes 3D rendering to Blender without Tripo', async () => {
  const start = main.indexOf("ipcMain.handle('media-generate'");
  const end = main.indexOf('const activeBlenderRenders', start);
  let handler;
  const calls = [];
  vm.runInNewContext(main.slice(start, end), {
    ipcMain: { handle: (_, fn) => { handler = fn; } }, fs: { existsSync: () => true },
    MEDIA_KINDS: { model2img: { folder: 'conversions' } }, ensureMediaFolder: () => 'folder',
    guardMediaLaunch: async (_, launch) => launch(),
    generateMediaWithBlender: async args => { calls.push(args); return { method: 'blender' }; },
    generateMediaWithTripo: () => { throw new Error('Tripo must not run'); },
  });
  const result = await handler({}, { projectPath: 'project', kind: 'model2img', baseImage: 'tree.fbx' });
  assert.equal(result.method, 'blender');
  assert.equal(calls[0].baseImage, 'tree.fbx');
});
test('Tripo backend rejects missing explicit selection before reading key or contacting API', async () => {
  const start = main.indexOf('async function generateMediaWithTripo(');
  const end = main.indexOf('// Résout la source', start);
  const generate = vm.runInNewContext(`(${main.slice(start, end).trim()})`, {
    loadApiKeys: () => { throw new Error('must not read key'); },
  });
  for (const args of [{ kind: 'model2img', provider: 'tripo', tripoApproved: true },
    { kind: 'img2model' }, { kind: 'img2model', provider: 'tripo' }, { kind: 'img2model', tripoApproved: true }]) {
    assert.ok((await generate(args)).error);
  }
});
test('workspace inline scripts remain valid JavaScript', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'workspace.html'), 'utf8');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if (match[1].trim()) new vm.Script(match[1]);
});

test('Toolbox Tripo action requires confirmation and sends explicit choice only after acceptance', async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'workspace.html'), 'utf8');
  const start = html.indexOf('  if (activeProject && !/^https?:/i.test(filePath)');
  const end = html.indexOf('// Upload to Roblox + copy ID', start);
  let button, confirmed = false;
  const requests = [];
  vm.runInNewContext(html.slice(start, end), {
    activeProject: { path: 'project' }, filePath: 'source.png', fileName: 'source.png', type: 'image',
    document: { createElement: () => ({}) }, footer: { appendChild: b => { button = b; } },
    confirm: () => confirmed, alert: () => {}, refreshToolbox: async () => {},
    window: { forgeAPI: {
      mediaCreateItem: async () => { requests.push('create'); return { item: { id: 'fixture' } }; },
      mediaGenerate: async options => { requests.push(options); return { error: 'test stops before polling' }; },
    } },
  });
  await button.onclick();
  assert.equal(requests.length, 0);
  confirmed = true;
  await button.onclick();
  assert.equal(requests[1].provider, 'tripo');
  assert.equal(requests[1].tripoApproved, true);
  assert.equal(requests[1].kind, 'img2model');
  assert.equal(button.disabled, false);
});
