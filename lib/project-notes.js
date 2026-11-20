'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ensureContextDirectory } = require('./forge-context');

const FILE_NAME = 'project-notes.md';
const MAX_CONTENT = 100000;

function notesPath(projectPath) {
  return path.join(projectPath, '.forge-context', FILE_NAME);
}

function revision(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function readProjectNotes(projectPath) {
  ensureContextDirectory(projectPath);
  const target = notesPath(projectPath);
  if (!fs.existsSync(target)) return { content: '', revision: revision(''), updatedAt: null };
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Fichier de notes non sûr.');
  const content = fs.readFileSync(target, 'utf8');
  if (content.length > MAX_CONTENT) throw new Error('Les notes dépassent la taille acceptée par Forge. Le fichier est conservé.');
  return { content, revision: revision(content), updatedAt: stat.mtime.toISOString() };
}

function writeProjectNotes(projectPath, content, expectedRevision) {
  if (typeof content !== 'string' || content.length > MAX_CONTENT) throw new Error(`Les notes sont limitées à ${MAX_CONTENT} caractères.`);
  if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) throw new Error('Charge les notes avant de les enregistrer.');
  const directory = ensureContextDirectory(projectPath);
  const current = readProjectNotes(projectPath);
  if (current.revision !== expectedRevision) return { conflict: true, ...current };
  const target = notesPath(projectPath);
  const temporary = path.join(directory, `${FILE_NAME}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    // Recheck immediately before replacement when an agent edits in parallel.
    if (readProjectNotes(projectPath).revision !== expectedRevision) return { conflict: true, ...readProjectNotes(projectPath) };
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return { success: true, ...readProjectNotes(projectPath) };
}

module.exports = { FILE_NAME, MAX_CONTENT, notesPath, readProjectNotes, writeProjectNotes };
