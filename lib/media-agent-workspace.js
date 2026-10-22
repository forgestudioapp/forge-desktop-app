'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { canonicalExistingPath, isPathInside } = require('./path-security');

function ensureRoot(baseDirectory) {
  fs.mkdirSync(baseDirectory, { recursive: true });
  const stat = fs.lstatSync(baseDirectory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Dossier de tâches média non sûr.');
  return canonicalExistingPath(baseDirectory);
}

function createMediaAgentWorkspace(baseDirectory, id) {
  const root = ensureRoot(baseDirectory);
  const name = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  if (!name) throw new Error('Identifiant de tâche média invalide.');
  const target = path.join(root, name);
  fs.mkdirSync(target, { recursive: false });
  const resolved = canonicalExistingPath(target);
  if (!resolved || resolved === root || !isPathInside(root, resolved)) throw new Error('Dossier de tâche média invalide.');
  return resolved;
}

function removeMediaAgentWorkspace(baseDirectory, targetDirectory) {
  const root = canonicalExistingPath(baseDirectory);
  const target = canonicalExistingPath(targetDirectory);
  if (!root || !target || target === root || !isPathInside(root, target)) return false;
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
  fs.rmSync(target, { recursive: true, force: true });
  return true;
}

module.exports = { createMediaAgentWorkspace, removeMediaAgentWorkspace };
