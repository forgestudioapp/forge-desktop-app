const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MAX_REVISIONS, listSessionHandoffs, saveSessionHandoff } = require('./session-handoff');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-handoff-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('saves structured revisions and exposes the latest one as readable context', t => {
  const root = fixture(t);
  const first = saveSessionHandoff(root, { objective: 'Finir le shop', decisions: '- UI violette\n- Trois cartes', files: 'src/shop.client.ts', tests: ['npm test'], openIssues: 'Prix à vérifier' });
  const second = saveSessionHandoff(root, { objective: 'Polir le shop', decisions: ['Animations validées'], files: [], tests: [], openIssues: [] });
  const history = listSessionHandoffs(root);
  assert.equal(first.entry.version, 1);
  assert.equal(second.entry.version, 2);
  assert.equal(history.currentId, second.entry.id);
  assert.deepEqual(history.revisions.map(item => item.objective), ['Polir le shop', 'Finir le shop']);
  const markdown = fs.readFileSync(path.join(root, '.forge-context', 'session-handoff.md'), 'utf8');
  assert.match(markdown, /Révision 2/);
  assert.match(markdown, /Polir le shop/);
  assert.match(markdown, /Ne la modifie pas automatiquement/);
});

test('requires an objective, strips list markers and bounds retained history', t => {
  const root = fixture(t);
  assert.throws(() => saveSessionHandoff(root, { decisions: ['x'] }), /objectif/);
  for (let i = 0; i < MAX_REVISIONS + 3; i += 1) saveSessionHandoff(root, { objective: `Étape ${i}`, files: `- src/${i}.ts` });
  const history = listSessionHandoffs(root);
  assert.equal(history.revisions.length, MAX_REVISIONS);
  assert.deepEqual(history.revisions[0].files, [`src/${MAX_REVISIONS + 2}.ts`]);
  assert.equal(history.revisions.at(-1).version, 4);
});

test('preserves malformed history and never writes through linked context storage', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, '.forge-context'));
  const journal = path.join(root, '.forge-context', 'session-handoffs.json');
  fs.writeFileSync(journal, '{bad json');
  assert.throws(() => saveSessionHandoff(root, { objective: 'Do not overwrite' }), /préservé/);
  assert.equal(fs.readFileSync(journal, 'utf8'), '{bad json');

  const linkedRoot = fixture(t);
  const project = path.join(linkedRoot, 'project');
  const external = path.join(linkedRoot, 'external');
  fs.mkdirSync(project); fs.mkdirSync(external);
  fs.symlinkSync(external, path.join(project, '.forge-context'), 'junction');
  assert.throws(() => saveSessionHandoff(project, { objective: 'Unsafe' }), /non sûr/);
  assert.deepEqual(fs.readdirSync(external), []);
});
