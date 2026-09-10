const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { refreshProjectIndex, LIMITS } = require('./project-index');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-index-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src'));
  return root;
}
const rows = result => fs.readFileSync(result.path, 'utf8').trim().split('\n').map(line => JSON.parse(line));

test('indexes TS/Luau declarations without source contents, dependencies or hidden files', async t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'src', 'shop.ts'), 'export function buy() {}\nconst token = "SECRET_VALUE";\n');
  fs.writeFileSync(path.join(root, 'src', 'npc.luau'), '-- NPC\nlocal function greet() end\nfunction NPC:walk() end');
  fs.mkdirSync(path.join(root, 'src', 'node_modules'));
  fs.writeFileSync(path.join(root, 'src', 'node_modules', 'ignore.ts'), 'export function ignore() {}');
  fs.writeFileSync(path.join(root, 'src', '.private.ts'), 'const password = "secret"');
  const result = await refreshProjectIndex(root);
  assert.equal(result.files, 2);
  const entries = rows(result);
  assert.equal(entries[0].incomplete, false);
  assert.deepEqual(entries.find(e => e.path === 'src/npc.luau').symbols, [{ name: 'greet', line: 2 }, { name: 'NPC:walk', line: 3 }]);
  assert.doesNotMatch(fs.readFileSync(result.path, 'utf8'), /SECRET_VALUE|ignore|password/);
});

test('reuses unchanged sources, handles edits, renamed and deleted files', async t => {
  const root = fixture(t);
  const source = path.join(root, 'src', 'a.ts');
  fs.writeFileSync(source, 'export function first() {}');
  const initial = await refreshProjectIndex(root);
  const unchanged = await refreshProjectIndex(root);
  assert.equal(unchanged.readFiles, 0);
  assert.equal(unchanged.reusedFiles, 1);
  assert.equal(unchanged.updated, false);
  fs.writeFileSync(source, 'export function secondName() {}');
  assert.equal((await refreshProjectIndex(root)).readFiles, 1);
  fs.renameSync(source, path.join(root, 'src', 'b.ts'));
  const renamed = rows(await refreshProjectIndex(root));
  assert.equal(renamed.length, 2);
  assert.equal(renamed[1].path, 'src/b.ts');
  assert.equal(renamed[1].symbols[0].name, 'secondName');
  fs.unlinkSync(path.join(root, 'src', 'b.ts'));
  assert.equal((await refreshProjectIndex(root)).files, 0);
  assert.equal(rows(initial).length, 1);
});

test('simultaneous refreshes remain isolated per project', async t => {
  const a = fixture(t), b = fixture(t);
  fs.writeFileSync(path.join(a, 'src', 'a.ts'), 'const apple = 1');
  fs.writeFileSync(path.join(b, 'src', 'b.ts'), 'const banana = 1');
  const results = await Promise.all([refreshProjectIndex(a), refreshProjectIndex(b), refreshProjectIndex(a)]);
  assert.equal(rows(results[0])[1].symbols[0].name, 'apple');
  assert.equal(rows(results[1])[1].symbols[0].name, 'banana');
  assert.equal(results[0].path, results[2].path);
});

test('bounded scan explicitly marks partial indexes', async t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'src', 'large.ts'), 'x'.repeat(100));
  const result = await refreshProjectIndex(root, { ...LIMITS, fileBytes: 10 });
  assert.equal(result.incomplete, true);
  assert.equal(rows(result)[0].incomplete, true);
  assert.equal(result.readFiles, 0);
});

test('does not follow linked source folders or linked output folders', async t => {
  const root = fixture(t), external = fixture(t);
  fs.writeFileSync(path.join(external, 'src', 'hidden.ts'), 'const hidden = 1');
  fs.symlinkSync(external, path.join(root, 'src', 'external'), 'junction');
  assert.equal((await refreshProjectIndex(root)).files, 0);
  const linked = fixture(t);
  fs.symlinkSync(external, path.join(linked, '.forge-context'), 'junction');
  await assert.rejects(refreshProjectIndex(linked), /non sûr/);
  assert.equal(fs.existsSync(path.join(external, 'files.ndjson')), false);
});

test('actual source reconciliation schedules index updates for changes and removals only', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'const a = 1');
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const start = main.indexOf('function reconcileSourceScripts(');
  const end = main.indexOf('\nfunction enqueueScriptSync(', start);
  const indexed = [];
  const context = { path, fs, currentSyncProjectPath: root,
    collectSourceScripts: src => fs.readdirSync(src), knownScriptSignatures: new Map(),
    scheduleSourceFileSync: () => {}, scheduleProjectIndex: project => indexed.push(project) };
  const reconcile = vm.runInNewContext(`(${main.slice(start, end).trim()})`, context);
  reconcile(path.join(root, 'src'));
  assert.deepEqual(indexed, [root]);
  reconcile(path.join(root, 'src'));
  assert.equal(indexed.length, 1);
  fs.unlinkSync(path.join(root, 'src', 'a.ts'));
  reconcile(path.join(root, 'src'));
  assert.deepEqual(indexed, [root, root]);
});
