const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MAX_CONTENT, notesPath, readProjectNotes, writeProjectNotes } = require('./project-notes');
const { buildContextBundle } = require('./forge-context');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-notes-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('notes are isolated by project and directly readable by an agent', t => {
  const root = fixture(t);
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');
  fs.mkdirSync(first); fs.mkdirSync(second);
  const initial = readProjectNotes(first);
  const saved = writeProjectNotes(first, '# Idées\nUne fusée', initial.revision);
  assert.equal(saved.success, true);
  assert.equal(fs.readFileSync(notesPath(first), 'utf8'), '# Idées\nUne fusée');
  assert.equal(readProjectNotes(second).content, '');
  assert.equal(fs.existsSync(notesPath(second)), false);
});

test('a concurrent agent edit is preserved and the user can save a reviewed draft', t => {
  const project = fixture(t);
  const starting = readProjectNotes(project);
  writeProjectNotes(project, 'Note utilisateur', starting.revision);
  const userView = readProjectNotes(project);
  fs.writeFileSync(notesPath(project), 'Note utilisateur\nNote agent', 'utf8');
  const conflict = writeProjectNotes(project, 'Brouillon utilisateur', userView.revision);
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.content, 'Note utilisateur\nNote agent');
  assert.equal(fs.readFileSync(notesPath(project), 'utf8'), conflict.content);
  const merged = writeProjectNotes(project, 'Note utilisateur\nNote agent\nBrouillon utilisateur', conflict.revision);
  assert.equal(merged.success, true);
  assert.equal(readProjectNotes(project).content, merged.content);
});

test('oversized notes and linked context paths are rejected without changing external files', t => {
  const root = fixture(t);
  const project = path.join(root, 'project');
  const external = path.join(root, 'external');
  fs.mkdirSync(project); fs.mkdirSync(external);
  const initial = readProjectNotes(project);
  assert.throws(() => writeProjectNotes(project, 'x'.repeat(MAX_CONTENT + 1), initial.revision), /limitées/);
  fs.rmSync(path.join(project, '.forge-context'), { recursive: true });
  fs.symlinkSync(external, path.join(project, '.forge-context'), 'junction');
  assert.throws(() => readProjectNotes(project), /non sûr/);
  assert.deepEqual(fs.readdirSync(external), []);
});

test('the workspace exposes notes and the agent startup context names the shared file', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'workspace.html'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const prompt = fs.readFileSync(path.join(root, 'forge-system-prompt.md'), 'utf8');
  assert.match(html, /id="projectNotesBtn"[^>]*openProjectNotes/);
  assert.match(html, /id="projectNotesInput"/);
  assert.match(preload, /readProjectNotes:.*project-notes-read/);
  assert.match(preload, /writeProjectNotes:.*project-notes-write/);
  assert.match(buildContextBundle(prompt).core, /\.forge-context\/project-notes\.md/);
});
