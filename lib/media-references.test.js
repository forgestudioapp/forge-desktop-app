const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { importMediaReferences } = require('./media-references');
const { buildCodexExec, buildCodexMediaInstructions } = require('./media-generation');

test('selected references are copied, deduplicated and attached alongside the source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-media-test-'));
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  const file = path.join(root, 'reference.png');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGAAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(file, png);
  const references = importMediaReferences(project, [file, file]);
  assert.equal(references.length, 1);
  assert.deepEqual(fs.readFileSync(references[0]), png);
  assert.deepEqual(importMediaReferences(project, [file]), references);
  const prompt = buildCodexMediaInstructions({ kind: 'thumb', count: 1, sourceImage: 'source.png', referenceImages: references, outputPaths: ['out.png'] });
  assert.match(prompt, /première image jointe est la source/);
  assert.ok(prompt.includes(references[0]));
  const command = buildCodexExec(prompt, ['source.png', ...references]);
  assert.equal(command.args.filter(x => x === '--image').length, 2);
  assert.deepEqual(fs.readFileSync(file), png);
});

test('invalid selections are rejected before launching a generation', () => {
  assert.throws(() => importMediaReferences('.', Array(5).fill('x')), /maximum 4/);
  assert.throws(() => importMediaReferences('.', ['relative.png']), /invalide/);
  assert.throws(() => importMediaReferences('.', [__filename]), /PNG, JPEG/);
  assert.deepEqual(importMediaReferences('.', []), []);
});

async function exerciseEditor(reply) {
  let api;
  let sent;
  const file = { name: 'reference.png' };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8'), {
    require: name => {
      assert.equal(name, 'electron');
      return {
        contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
        webUtils: { getPathForFile: value => { assert.equal(value, file); return '/chosen/reference.png'; } },
        ipcRenderer: { invoke: async (channel, options) => { sent = { channel, options }; return reply; } },
      };
    },
  });
  const html = fs.readFileSync(path.join(__dirname, '..', 'thumbnail.html'), 'utf8');
  const start = html.indexOf('  async function applyEdit(){');
  const end = html.indexOf('  // ── Polling', start);
  assert.ok(start > 0 && end > start);
  const state = { projectPath: '/game', editSource: { kind: 'thumb', itemId: 'one', file: 'source.png' }, editCount: 1, refFiles: [file] };
  let closed = false;
  let alert;
  await vm.runInNewContext(html.slice(start, end) + '\napplyEdit();', {
    state, document: { getElementById: () => ({ value: 'Use this palette' }) },
    window: { forgeAPI: api }, countRequestedInPrompt: (_p, count) => count,
    closeEditModal: () => { closed = true; state.refFiles = []; },
    startPolling: () => {}, refresh: async () => {}, alert: message => { alert = message; },
  });
  return { sent, state, closed, alert };
}

test('actual editor and preload pass references before clearing the selection', async () => {
  const result = await exerciseEditor({ jobId: 'started' });
  assert.equal(result.sent.channel, 'media-variants');
  assert.equal(result.sent.options.referencePaths[0], '/chosen/reference.png');
  assert.equal(result.sent.options.baseImage, 'source.png');
  assert.equal(result.closed, true);
  assert.equal(result.state.editSubmitting, false);
});

test('failed launch preserves the editor selection for a retry', async () => {
  const result = await exerciseEditor({ error: 'Agent indisponible' });
  assert.equal(result.closed, false);
  assert.equal(result.state.refFiles.length, 1);
  assert.equal(result.alert, 'Agent indisponible');
  assert.equal(result.state.editSubmitting, false);
});
