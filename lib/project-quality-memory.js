const fs = require('node:fs');
const path = require('node:path');
const { ensureContextDirectory } = require('./forge-context');

const MAX_CONTENT = 20000;
const FILE_NAME = 'project-quality.md';
const HEADER = '# Mémoire de qualité du projet\n\n';

function memoryPath(projectPath) {
  return path.join(projectPath, '.forge-context', FILE_NAME);
}

function normalizeContent(content) {
  const value = String(content || '').replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
  if (value.length > MAX_CONTENT) throw new Error(`La mémoire de qualité est limitée à ${MAX_CONTENT} caractères.`);
  return value;
}

function readProjectQualityMemory(projectPath) {
  ensureContextDirectory(projectPath);
  const target = memoryPath(projectPath);
  if (!fs.existsSync(target)) return { content: '', updatedAt: null };
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Fichier de mémoire de qualité non sûr.');
  const raw = fs.readFileSync(target, 'utf8');
  const content = raw.startsWith(HEADER) ? raw.slice(HEADER.length) : raw;
  return { content: normalizeContent(content), updatedAt: stat.mtime.toISOString() };
}

function writeProjectQualityMemory(projectPath, content) {
  const value = normalizeContent(content);
  const directory = ensureContextDirectory(projectPath);
  const target = memoryPath(projectPath);
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Fichier de mémoire de qualité non sûr.');
  if (!value) {
    if (fs.existsSync(target)) fs.unlinkSync(target);
    return { content: '', updatedAt: null, deleted: true };
  }
  const temporary = path.join(directory, `${FILE_NAME}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, HEADER + value + '\n', { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, target);
  } finally {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (_) {}
  }
  return readProjectQualityMemory(projectPath);
}

module.exports = { MAX_CONTENT, FILE_NAME, memoryPath, normalizeContent, readProjectQualityMemory, writeProjectQualityMemory };
