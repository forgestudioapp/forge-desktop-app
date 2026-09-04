const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildCodexExec,
  findMediaEntry,
  variantsForOutput,
} = require('./media-generation');

test('builds a non-interactive Codex command and sends the prompt through stdin', () => {
  const command = buildCodexExec('Crée 2 miniatures & garde le texte', ['C:\\project\\source.png']);
  assert.deepEqual(command.args.slice(0, 4), [
    'exec',
    '--dangerously-bypass-approvals-and-sandbox',
    '--skip-git-repo-check',
    '--ephemeral',
  ]);
  assert.deepEqual(command.args.slice(-3), ['--image', 'C:\\project\\source.png', '-']);
  assert.equal(command.args.includes('-p'), false);
  assert.equal(command.stdin, 'Crée 2 miniatures & garde le texte');
});

test('finds base and variant entries', () => {
  const item = { id: 'item', files: ['thumbnails/base.png'], variants: [{ id: 'variant', files: [] }] };
  const manifest = { categories: { thumb: { items: [item] } } };
  assert.equal(findMediaEntry(manifest, 'thumb', 'item', null), item);
  assert.equal(findMediaEntry(manifest, 'thumb', 'item', 'variant'), item.variants[0]);
  assert.equal(findMediaEntry(manifest, 'thumb', 'missing', null), null);
});

test('groups variants below the exact image they derive from', () => {
  const item = {
    files: ['thumbnails/a.png', 'thumbnails/b.png'],
    variants: [
      { id: 'va', parentFile: 'thumbnails/a.png' },
      { id: 'vb', parentFile: 'thumbnails/b.png' },
      { id: 'nested', parentVariantId: 'va', parentFile: 'thumbnails/va-1.png' },
    ],
  };
  assert.deepEqual(variantsForOutput(item, null, 'thumbnails/a.png').map(v => v.id), ['va']);
  assert.deepEqual(variantsForOutput(item, null, 'thumbnails/b.png').map(v => v.id), ['vb']);
  assert.deepEqual(variantsForOutput(item, 'va', 'thumbnails/va-1.png').map(v => v.id), ['nested']);
});
