const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { buildContextBundle, syncForgeContext } = require('./forge-context');
const prompt = fs.readFileSync(path.join(__dirname, '..', 'forge-system-prompt.md'), 'utf8');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-context-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('real prompt preserves every paragraph and keeps critical rules in startup context', () => {
  const bundle = buildContextBundle(prompt);
  assert.equal(bundle.full, false);
  const combined = [bundle.core, ...bundle.guides.map(g => g.content)].join('\n\n');
  for (const paragraph of prompt.replace(/\r\n/g, '\n').trim().split(/\n\n+/)) assert.ok(combined.includes(paragraph), paragraph);
  for (const section of [1, 2, 3, 4, 5, 6, 7, 9, 10, 15, 16, 17]) assert.match(bundle.core, new RegExp(`## ${section}\\.`));
  assert.ok(Buffer.byteLength(bundle.core) < Buffer.byteLength(prompt) * 0.7);
  assert.equal(bundle.guides.length, 5);
});

test('three agents get valid guide paths, custom rules survive and repeated preparation does not rewrite', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Custom rules\nUse existing architecture.\n');
  for (const agent of ['codex', 'claude', 'antigravity']) {
    const first = syncForgeContext(root, agent, prompt);
    assert.equal(first.full, false);
    const before = fs.statSync(first.path).mtimeMs;
    const second = syncForgeContext(root, agent, prompt);
    assert.equal(second.updated, false);
    assert.equal(fs.statSync(first.path).mtimeMs, before);
    const text = fs.readFileSync(first.path, 'utf8');
    for (const guide of buildContextBundle(prompt).guides) {
      assert.ok(text.includes(guide.path));
      assert.equal(fs.readFileSync(path.join(root, guide.path), 'utf8'), guide.content);
    }
  }
  assert.match(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), /Use existing architecture/);
});

test('modified guide is preserved and triggers full instructions fallback', t => {
  const root = fixture(t);
  syncForgeContext(root, 'codex', prompt);
  const guide = path.join(root, buildContextBundle(prompt).guides[0].path);
  fs.writeFileSync(guide, 'User changes');
  const result = syncForgeContext(root, 'codex', prompt);
  assert.equal(result.full, true);
  assert.equal(fs.readFileSync(guide, 'utf8'), 'User changes');
  assert.ok(fs.readFileSync(result.path, 'utf8').includes(prompt.replace(/\r\n/g, '\n').trim()));
});

test('changed prompt creates new guides while old sessions keep their references', t => {
  const root = fixture(t);
  syncForgeContext(root, 'codex', prompt);
  const old = buildContextBundle(prompt).guides[0];
  const changed = prompt + '\nA new delivery rule.\n';
  syncForgeContext(root, 'codex', changed);
  assert.notEqual(old.path, buildContextBundle(changed).guides[0].path);
  assert.equal(fs.readFileSync(path.join(root, old.path), 'utf8'), old.content);
});

test('unknown layout is never silently split or truncated', () => {
  const future = prompt + '\n## 18. Future instructions\nDo this.\n';
  assert.equal(buildContextBundle(future).full, true);
  assert.equal(buildContextBundle('Short prompt').core, 'Short prompt');
});

test('linked context directory is not written through', t => {
  const root = fixture(t);
  const external = path.join(root, 'external');
  const project = path.join(root, 'project');
  fs.mkdirSync(external);
  fs.mkdirSync(project);
  fs.symlinkSync(external, path.join(project, '.forge-context'), 'junction');
  assert.equal(syncForgeContext(project, 'codex', prompt).full, true);
  assert.deepEqual(fs.readdirSync(external), []);
});

test('actual agent preparation installs modular context and schedules the selected project index', t => {
  const root = fixture(t);
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const start = main.indexOf('function prepareForgeAgentInstructions(');
  const end = main.indexOf('\n// ===', start);
  const scheduled = [];
  const prepare = vm.runInNewContext(`(${main.slice(start, end).trim()})`, {
    syncForgeContext, loadForgeSystemPrompt: () => prompt,
    scheduleProjectIndex: project => scheduled.push(project), console,
  });
  assert.equal(prepare(root, 'codex').full, false);
  assert.deepEqual(scheduled, [root]);
  prepare(root, 'unsupported');
  assert.deepEqual(scheduled, [root]);
});
