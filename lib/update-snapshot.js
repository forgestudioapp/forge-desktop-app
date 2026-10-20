'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { writeAtomic } = require('./protected-keys');

const STATE_FILE = 'forge-version-state.json';
const SNAPSHOT_DIRECTORY = 'update-snapshots';
const DEFAULT_ENTRIES = [
  'projects-registry.json', 'projects-registry.json.bak', 'active-project.json',
  'forge-settings.json', 'forge-session.json', 'forge-license.json',
  'api-keys.json', 'roblox-token.json', 'github-token.json', 'github-device.json',
  'agents-state.json', 'agent-usage.json', 'notifications.json',
  'agent-activity', 'project-checkpoints',
];

function safeVersion(value) {
  return String(value || 'unknown').replace(/[^0-9A-Za-z._-]+/g, '_').slice(0, 80);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function fileHash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function listFiles(root, relative = '') {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) return [];
  const stat = fs.statSync(directory);
  if (stat.isFile()) return [relative];
  if (!stat.isDirectory() || stat.isSymbolicLink()) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? listFiles(root, child) : entry.isFile() ? [child] : [];
  });
}

function copyEntry(userDataDir, snapshotDir, entry) {
  const source = path.join(userDataDir, entry);
  if (!fs.existsSync(source)) return [];
  const files = listFiles(userDataDir, entry);
  for (const relative of files) {
    const from = path.join(userDataDir, relative);
    const to = path.join(snapshotDir, relative);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  return files;
}

function pruneSnapshots(root, keep = 3) {
  if (!fs.existsSync(root)) return;
  const snapshots = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({ name: entry.name, path: path.join(root, entry.name), time: fs.statSync(path.join(root, entry.name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  for (const snapshot of snapshots.slice(Math.max(1, keep))) fs.rmSync(snapshot.path, { recursive: true, force: true });
}

function prepareUpdateSnapshot({ userDataDir, currentVersion, now = new Date(), keep = 3, entries = DEFAULT_ENTRIES }) {
  if (!userDataDir || !currentVersion) throw new Error('Dossier utilisateur et version Forge requis.');
  fs.mkdirSync(userDataDir, { recursive: true });
  const statePath = path.join(userDataDir, STATE_FILE);
  const previous = readJson(statePath);
  const previousVersion = typeof previous?.version === 'string' ? previous.version : null;
  if (previousVersion === currentVersion) return { changed: false, previousVersion, currentVersion, snapshotDir: null, files: [] };

  let snapshotDir = null;
  let files = [];
  const hasLegacyData = !previousVersion && entries.some(entry => fs.existsSync(path.join(userDataDir, entry)));
  if (previousVersion || hasLegacyData) {
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const fromVersion = previousVersion || 'legacy-unversioned';
    snapshotDir = path.join(userDataDir, SNAPSHOT_DIRECTORY, `${stamp}-from-${safeVersion(fromVersion)}`);
    fs.mkdirSync(snapshotDir, { recursive: true });
    files = [...new Set(entries.flatMap(entry => copyEntry(userDataDir, snapshotDir, entry)))].sort();
    const manifest = {
      schemaVersion: 1,
      createdAt: now.toISOString(),
      fromVersion,
      toVersion: currentVersion,
      files: files.map(relative => ({ relative, bytes: fs.statSync(path.join(snapshotDir, relative)).size, sha256: fileHash(path.join(snapshotDir, relative)) })),
    };
    writeAtomic(path.join(snapshotDir, 'snapshot-manifest.json'), manifest);
    pruneSnapshots(path.join(userDataDir, SNAPSHOT_DIRECTORY), keep);
  }
  writeAtomic(statePath, { version: currentVersion, updatedAt: now.toISOString(), previousVersion });
  return { changed: Boolean(previousVersion || hasLegacyData), previousVersion, currentVersion, snapshotDir, files };
}

function restoreUpdateSnapshot({ userDataDir, snapshotDir }) {
  const root = path.resolve(userDataDir);
  const source = path.resolve(snapshotDir);
  const allowedRoot = path.resolve(root, SNAPSHOT_DIRECTORY) + path.sep;
  if (!source.startsWith(allowedRoot)) throw new Error('La sauvegarde doit appartenir au dossier update-snapshots de Forge.');
  const manifestPath = path.join(source, 'snapshot-manifest.json');
  const manifest = readJson(manifestPath);
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) throw new Error('Manifeste de sauvegarde invalide.');
  for (const item of manifest.files) {
    if (!item || typeof item.relative !== 'string' || path.isAbsolute(item.relative) || item.relative.includes('..')) throw new Error('Chemin de sauvegarde invalide.');
    const from = path.join(source, item.relative);
    if (!fs.existsSync(from) || fileHash(from) !== item.sha256) throw new Error(`Sauvegarde altérée : ${item.relative}`);
  }
  for (const item of manifest.files) {
    const from = path.join(source, item.relative);
    const to = path.join(root, item.relative);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  return { restored: manifest.files.length, fromVersion: manifest.fromVersion, toVersion: manifest.toVersion };
}

module.exports = { DEFAULT_ENTRIES, prepareUpdateSnapshot, restoreUpdateSnapshot };
