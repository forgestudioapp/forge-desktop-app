const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ensureContextDirectory } = require('./forge-context');

const SCHEMA_VERSION = 1;
const MAX_REVISIONS = 30;
const MAX_FIELD_LENGTH = 8000;
const STORE_FILE = 'session-handoffs.json';
const CURRENT_FILE = 'session-handoff.md';
const FIELDS = ['decisions', 'files', 'tests', 'openIssues'];

function targetPath(projectPath, fileName) {
  return path.join(projectPath, '.forge-context', fileName);
}

function cleanText(value, limit = MAX_FIELD_LENGTH) {
  const text = String(value || '').replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
  if (text.length > limit) throw new Error(`Un champ de la fiche dépasse ${limit} caractères.`);
  return text;
}

function cleanList(value) {
  const source = Array.isArray(value) ? value : String(value || '').split('\n');
  return source.map(item => cleanText(String(item).replace(/^\s*[-*]\s*/, ''), 1000)).filter(Boolean).slice(0, 100);
}

function normalizeDraft(draft) {
  const source = draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : {};
  const normalized = { objective: cleanText(source.objective) };
  for (const field of FIELDS) normalized[field] = cleanList(source[field]);
  if (!normalized.objective) throw new Error('L’objectif de la fiche de reprise est obligatoire.');
  return normalized;
}

function assertSafeFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Fichier de reprise non sûr.');
  return true;
}

function emptyJournal() {
  return { schemaVersion: SCHEMA_VERSION, currentId: null, revisions: [] };
}

function readJournal(projectPath) {
  ensureContextDirectory(projectPath);
  const filePath = targetPath(projectPath, STORE_FILE);
  if (!assertSafeFile(filePath)) return emptyJournal();
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (_) { throw new Error('Historique de reprise illisible. Le fichier a été préservé.'); }
  if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.revisions)) {
    throw new Error('Version de l’historique de reprise non prise en charge.');
  }
  const revisions = parsed.revisions.slice(0, MAX_REVISIONS).map(item => ({
    id: cleanText(item.id, 100),
    version: Number.isInteger(item.version) && item.version > 0 ? item.version : 1,
    createdAt: cleanText(item.createdAt, 100),
    objective: cleanText(item.objective),
    decisions: cleanList(item.decisions),
    files: cleanList(item.files),
    tests: cleanList(item.tests),
    openIssues: cleanList(item.openIssues),
  })).filter(item => item.id && item.objective);
  const currentId = revisions.some(item => item.id === parsed.currentId) ? parsed.currentId : revisions[0]?.id || null;
  return { schemaVersion: SCHEMA_VERSION, currentId, revisions };
}

function markdownList(items) {
  return items.length ? items.map(item => `- ${item}`).join('\n') : '- Aucun élément renseigné.';
}

function renderCurrent(entry) {
  return [
    '# Fiche de reprise Forge',
    '',
    `Révision ${entry.version} — ${entry.createdAt}`,
    '',
    'Cette fiche a été enregistrée manuellement par l’utilisateur. Ne la modifie pas automatiquement.',
    '',
    '## Objectif', '', entry.objective,
    '', '## Décisions', '', markdownList(entry.decisions),
    '', '## Fichiers concernés', '', markdownList(entry.files),
    '', '## Tests effectués', '', markdownList(entry.tests),
    '', '## Problèmes ouverts', '', markdownList(entry.openIssues),
    '',
  ].join('\n');
}

function writeAtomic(directory, fileName, content) {
  const target = path.join(directory, fileName);
  if (assertSafeFile(target)) {
    // The safety check above prevents replacing links or special files.
  }
  const temporary = path.join(directory, `${fileName}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, target);
  } finally {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (_) {}
  }
}

function listSessionHandoffs(projectPath) {
  const journal = readJournal(projectPath);
  return { currentId: journal.currentId, revisions: journal.revisions };
}

function saveSessionHandoff(projectPath, draft) {
  const normalized = normalizeDraft(draft);
  const directory = ensureContextDirectory(projectPath);
  const journal = readJournal(projectPath);
  const highestVersion = journal.revisions.reduce((max, item) => Math.max(max, item.version), 0);
  const entry = {
    id: randomUUID(),
    version: highestVersion + 1,
    createdAt: new Date().toISOString(),
    ...normalized,
  };
  const next = {
    schemaVersion: SCHEMA_VERSION,
    currentId: entry.id,
    revisions: [entry, ...journal.revisions].slice(0, MAX_REVISIONS),
  };
  writeAtomic(directory, STORE_FILE, JSON.stringify(next, null, 2) + '\n');
  writeAtomic(directory, CURRENT_FILE, renderCurrent(entry));
  return { currentId: entry.id, entry, revisions: next.revisions };
}

module.exports = {
  SCHEMA_VERSION,
  MAX_REVISIONS,
  MAX_FIELD_LENGTH,
  STORE_FILE,
  CURRENT_FILE,
  normalizeDraft,
  renderCurrent,
  listSessionHandoffs,
  saveSessionHandoff,
};
