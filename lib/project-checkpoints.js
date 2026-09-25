const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EXCLUDED_NAMES = new Set([
  '.git',
  '.forge-checkpoints',
  '.forge-memory',
  'node_modules',
  'dist',
  'build',
  '.cache',
]);

function projectKey(projectPath) {
  return crypto.createHash('sha256').update(path.resolve(projectPath)).digest('hex').slice(0, 24);
}

function checkpointRoot(storageRoot, projectPath) {
  return path.join(storageRoot, projectKey(projectPath));
}

function safeLabel(label) {
  const normalized = String(label || 'Point de retour').replace(/[\u0000-\u001f]/g, ' ').trim();
  return normalized.slice(0, 100) || 'Point de retour';
}

function shouldExclude(name) {
  return EXCLUDED_NAMES.has(name) || name.endsWith('.tmp') || name.endsWith('.lock');
}

function hashFileSync(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = fs.openSync(filePath, 'r');
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function copyTree(source, destination, relative = '', stats = { files: 0, bytes: 0, skipped: [], entries: [] }, recordIntegrity = true) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const rel = relative ? path.join(relative, entry.name) : entry.name;
    if (shouldExclude(entry.name)) {
      stats.skipped.push(rel);
      continue;
    }
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    const info = fs.lstatSync(from);
    if (info.isSymbolicLink()) {
      stats.skipped.push(rel);
      continue;
    }
    if (info.isDirectory()) {
      copyTree(from, to, rel, stats, recordIntegrity);
    } else if (info.isFile()) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      fs.utimesSync(to, info.atime, info.mtime);
      stats.files += 1;
      stats.bytes += info.size;
      if (recordIntegrity) stats.entries.push({ path: rel.split(path.sep).join('/'), size: info.size, sha256: hashFileSync(to) });
    }
  }
  return stats;
}

function verifyCheckpointFiles(directory, metadata) {
  if (!Array.isArray(metadata.entries) || metadata.entries.length !== metadata.files) {
    throw new Error('Le manifeste du point de retour est incomplet.');
  }
  const filesRoot = path.join(directory, 'files');
  for (const entry of metadata.entries) {
    if (!entry || typeof entry.path !== 'string' || entry.path.includes('..') || path.isAbsolute(entry.path)) {
      throw new Error('Le manifeste du point de retour est invalide.');
    }
    const filePath = path.resolve(filesRoot, ...entry.path.split('/'));
    if (!filePath.startsWith(path.resolve(filesRoot) + path.sep)) throw new Error('Chemin invalide dans le point de retour.');
    let info;
    try { info = fs.statSync(filePath); } catch (_) { throw new Error(`Fichier manquant dans le point de retour : ${entry.path}`); }
    if (!info.isFile() || info.size !== entry.size || hashFileSync(filePath) !== entry.sha256) {
      throw new Error(`Point de retour endommagé : ${entry.path}`);
    }
  }
}

function clearIncludedTree(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (shouldExclude(entry.name)) continue;
    const target = path.join(root, entry.name);
    const info = fs.lstatSync(target);
    if (info.isSymbolicLink() || info.isFile()) {
      fs.rmSync(target, { force: true });
    } else if (info.isDirectory()) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}

function readMetadata(directory) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
    return value && value.id ? value : null;
  } catch (_) {
    return null;
  }
}

function createProjectCheckpoint({ projectPath, storageRoot, label, reason = 'manual' }) {
  const source = fs.realpathSync(projectPath);
  if (!fs.statSync(source).isDirectory()) throw new Error('Projet invalide.');
  fs.mkdirSync(checkpointRoot(storageRoot, source), { recursive: true });
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
  const finalDirectory = path.join(checkpointRoot(storageRoot, source), id);
  const temporaryDirectory = `${finalDirectory}.tmp`;
  fs.mkdirSync(temporaryDirectory, { recursive: true });
  try {
    const stats = copyTree(source, path.join(temporaryDirectory, 'files'));
    const metadata = {
      id,
      label: safeLabel(label),
      reason,
      projectPath: source,
      createdAt: new Date().toISOString(),
      files: stats.files,
      bytes: stats.bytes,
      skipped: stats.skipped,
      entries: stats.entries,
    };
    fs.writeFileSync(path.join(temporaryDirectory, 'metadata.json'), JSON.stringify(metadata, null, 2));
    fs.renameSync(temporaryDirectory, finalDirectory);
    return metadata;
  } catch (error) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

function listProjectCheckpoints({ projectPath, storageRoot }) {
  const root = checkpointRoot(storageRoot, projectPath);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.endsWith('.tmp'))
    .map(entry => readMetadata(path.join(root, entry.name)))
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function resolveCheckpoint(projectPath, storageRoot, checkpointId) {
  const id = String(checkpointId || '');
  if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error('Point de retour invalide.');
  const directory = path.join(checkpointRoot(storageRoot, projectPath), id);
  const metadata = readMetadata(directory);
  if (!metadata) throw new Error('Point de retour introuvable.');
  if (path.resolve(metadata.projectPath) !== path.resolve(fs.realpathSync(projectPath))) {
    throw new Error('Ce point de retour appartient à un autre projet.');
  }
  return { directory, metadata };
}

function restoreProjectCheckpoint({ projectPath, storageRoot, checkpointId }) {
  const project = fs.realpathSync(projectPath);
  const { directory, metadata } = resolveCheckpoint(project, storageRoot, checkpointId);
  verifyCheckpointFiles(directory, metadata);
  const safety = createProjectCheckpoint({
    projectPath: project,
    storageRoot,
    label: `Sauvegarde avant restauration de ${metadata.label}`,
    reason: 'pre-restore',
  });
  try {
    clearIncludedTree(project);
    const stats = copyTree(path.join(directory, 'files'), project, '', { files: 0, bytes: 0, skipped: [], entries: [] }, false);
    return { restored: metadata, safety, files: stats.files, bytes: stats.bytes };
  } catch (error) {
    try {
      clearIncludedTree(project);
      const safetyDirectory = path.join(checkpointRoot(storageRoot, project), safety.id, 'files');
      copyTree(safetyDirectory, project, '', { files: 0, bytes: 0, skipped: [], entries: [] }, false);
    } catch (_) {}
    throw error;
  }
}

function deleteProjectCheckpoint({ projectPath, storageRoot, checkpointId }) {
  const { directory, metadata } = resolveCheckpoint(projectPath, storageRoot, checkpointId);
  fs.rmSync(directory, { recursive: true, force: true });
  return metadata;
}

function pruneAutomaticProjectCheckpoints({ projectPath, storageRoot, keep = 12 }) {
  const automatic = listProjectCheckpoints({ projectPath, storageRoot })
    .filter(item => item.reason === 'before-agents' || item.reason === 'pre-restore');
  const removed = [];
  for (const item of automatic.slice(Math.max(0, keep))) {
    deleteProjectCheckpoint({ projectPath, storageRoot, checkpointId: item.id });
    removed.push(item.id);
  }
  return removed;
}

module.exports = {
  EXCLUDED_NAMES,
  checkpointRoot,
  createProjectCheckpoint,
  listProjectCheckpoints,
  restoreProjectCheckpoint,
  deleteProjectCheckpoint,
  pruneAutomaticProjectCheckpoints,
};
