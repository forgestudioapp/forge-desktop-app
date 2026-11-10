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
const CODE_EXTENSIONS = new Set(['.lua', '.luau', '.ts', '.tsx', '.js', '.jsx', '.json', '.toml']);
function isCodeFile(relative) { return CODE_EXTENSIONS.has(path.extname(relative).toLowerCase()); }

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

function copyTree(source, destination, relative = '', stats = { files: 0, bytes: 0, skipped: [], entries: [] }, recordIntegrity = true, kind = 'archive') {
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
      copyTree(from, to, rel, stats, recordIntegrity, kind);
    } else if (info.isFile()) {
      if (kind === 'code' && !isCodeFile(rel)) continue;
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

function createProjectCheckpoint({ projectPath, storageRoot, label, reason = 'manual', kind = 'archive', agent = null, objective = null, placeId = null, lastValidBuildId = null, taskId = null, beforeEntries = null, beforeCheckpointId = null }) {
  const source = fs.realpathSync(projectPath);
  if (!fs.statSync(source).isDirectory()) throw new Error('Projet invalide.');
  fs.mkdirSync(checkpointRoot(storageRoot, source), { recursive: true });
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
  const finalDirectory = path.join(checkpointRoot(storageRoot, source), id);
  const temporaryDirectory = `${finalDirectory}.tmp`;
  fs.mkdirSync(temporaryDirectory, { recursive: true });
  try {
    if (!['archive', 'code'].includes(kind)) throw new Error('Type de version invalide.');
    const stats = copyTree(source, path.join(temporaryDirectory, 'files'), '', { files: 0, bytes: 0, skipped: [], entries: [] }, true, kind);
    const metadata = {
      id,
      label: safeLabel(label),
      reason,
      kind,
      agent,
      objective: objective ? String(objective).slice(0, 1000) : null,
      placeId: placeId == null ? null : String(placeId),
      lastValidBuildId,
      taskId,
      beforeCheckpointId,
      affectedFiles: beforeEntries ? checkpointChangedFiles({ entries: beforeEntries }, { entries: stats.entries }) : stats.entries.map(entry => entry.path),
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

function currentEntries(projectPath, kind) {
  const entries = [];
  function visit(dir, relative = '') {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (shouldExclude(item.name)) continue;
      const rel = relative ? `${relative}/${item.name}` : item.name;
      const file = path.join(dir, item.name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(file, rel);
      else if (stat.isFile() && (kind === 'archive' || isCodeFile(rel))) entries.push({ path: rel, size: stat.size, sha256: hashFileSync(file) });
    }
  }
  visit(projectPath);
  return entries;
}

function safeProjectFile(root, relative) {
  const segments = relative.split('/');
  if (!segments.length || segments.some(segment => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) throw new Error('Chemin de fichier invalide.');
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Lien symbolique interdit pendant la restauration : ${relative}`);
  }
  return current;
}

function planProjectCheckpointRestore({ projectPath, storageRoot, checkpointId }) {
  const project = fs.realpathSync(projectPath);
  const { directory, metadata } = resolveCheckpoint(project, storageRoot, checkpointId);
  verifyCheckpointFiles(directory, metadata);
  const kind = metadata.kind || 'archive';
  const oldFiles = new Map(metadata.entries.map(item => [item.path, item]));
  const present = new Map(currentEntries(project, kind).map(item => [item.path, item]));
  const restored = metadata.entries.filter(item => present.get(item.path)?.sha256 !== item.sha256).map(item => item.path);
  const kept = [...present.keys()].filter(item => !oldFiles.has(item));
  const unchanged = metadata.entries.filter(item => present.get(item.path)?.sha256 === item.sha256).map(item => item.path);
  const diffs = restored.slice(0, 50).map(rel => {
    const snapshot = path.join(directory, 'files', ...rel.split('/'));
    const live = safeProjectFile(project, rel);
    const read = file => isCodeFile(rel) && fs.existsSync(file) && fs.statSync(file).size <= 32768 ? fs.readFileSync(file, 'utf8') : null;
    return { path: rel, before: read(live), after: read(snapshot) };
  });
  return { checkpoint: metadata, restored, kept, unchanged, diffs, deletable: kept };
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

function checkpointChangedFiles(before, after) {
  const first = new Map(before.entries.map(item => [item.path, item.sha256]));
  const second = new Map(after.entries.map(item => [item.path, item.sha256]));
  return [...new Set([...first.keys(), ...second.keys()])].filter(rel => first.get(rel) !== second.get(rel)).sort();
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

function restoreProjectCheckpoint({ projectPath, storageRoot, checkpointId, deletePaths = [], failAfter = null }) {
  const project = fs.realpathSync(projectPath);
  const { directory, metadata } = resolveCheckpoint(project, storageRoot, checkpointId);
  const plan = planProjectCheckpointRestore({ projectPath: project, storageRoot, checkpointId });
  if (!Array.isArray(deletePaths) || deletePaths.some(rel => !plan.deletable.includes(rel))) throw new Error('Liste de suppressions invalide.');
  for (const entry of metadata.entries) safeProjectFile(project, entry.path);
  const safety = createProjectCheckpoint({
    projectPath: project,
    storageRoot,
    label: `Sauvegarde avant restauration de ${metadata.label}`,
    reason: 'pre-restore',
    kind: 'archive',
  });
  try {
    for (const rel of deletePaths) fs.rmSync(safeProjectFile(project, rel), { force: true });
    let count = 0;
    for (const entry of metadata.entries) {
      const from = path.join(directory, 'files', ...entry.path.split('/'));
      const to = safeProjectFile(project, entry.path);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      if (failAfter !== null && ++count >= failAfter) throw new Error('Restauration interrompue.');
    }
    return { restored: metadata, safety, files: metadata.files, bytes: metadata.bytes, plan, deleted: deletePaths };
  } catch (error) {
    try {
      clearIncludedTree(project);
      const safetyDirectory = path.join(checkpointRoot(storageRoot, project), safety.id, 'files');
      copyTree(safetyDirectory, project, '', { files: 0, bytes: 0, skipped: [], entries: [] }, false);
    } catch (rollbackError) { throw new AggregateError([error, rollbackError], 'La restauration et son annulation ont échoué.'); }
    throw error;
  }
}

function deleteProjectCheckpoint({ projectPath, storageRoot, checkpointId }) {
  const { directory, metadata } = resolveCheckpoint(projectPath, storageRoot, checkpointId);
  fs.rmSync(directory, { recursive: true, force: true });
  return metadata;
}

function pruneAutomaticProjectCheckpoints({ projectPath, storageRoot, keep = 12 }) {
  const all = listProjectCheckpoints({ projectPath, storageRoot });
  const automatic = all.filter(item => item.reason === 'before-agents' || item.reason === 'pre-restore');
  const agentVersions = all.filter(item => item.reason === 'agent-before' || item.reason === 'agent-after');
  const removed = [];
  for (const item of [...automatic.slice(Math.max(0, keep)), ...agentVersions.slice(100)]) {
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
  planProjectCheckpointRestore,
  checkpointChangedFiles,
  deleteProjectCheckpoint,
  pruneAutomaticProjectCheckpoints,
};
