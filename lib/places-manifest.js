const fs = require('node:fs');
const path = require('node:path');
const { normalizeRobloxId } = require('./project-place-link');

const FILE = 'forge.places.json';
const safeFolder = value => typeof value === 'string' && /^src(?:\/[A-Za-z0-9_-]+)*$/.test(value) && !value.split('/').includes('..');
const placeFolder = id => `src/places/${id}`;

function manifestPath(projectPath) { return path.join(projectPath, FILE); }
function validate(manifest) {
  if (!manifest || manifest.version !== 1 || !normalizeRobloxId(manifest.universeId) || !Array.isArray(manifest.places) || !Array.isArray(manifest.sharedFolders)) throw new Error('Manifeste Places invalide.');
  if (!manifest.sharedFolders.every(safeFolder)) throw new Error('Dossier commun invalide.');
  const ids = new Set();
  for (const place of manifest.places) {
    const id = normalizeRobloxId(place.placeId);
    if (!id || ids.has(id) || typeof place.name !== 'string' || !place.name.trim() || typeof place.role !== 'string' || !place.role.trim() || !Array.isArray(place.codeFolders) || !place.codeFolders.every(safeFolder)) throw new Error('Place ou dossier spécifique invalide.');
    ids.add(id);
  }
  return manifest;
}
function read(projectPath) {
  const file = manifestPath(projectPath);
  if (!fs.existsSync(file)) return null;
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Le manifeste Places ne peut pas être un lien symbolique.');
  return validate(JSON.parse(fs.readFileSync(file, 'utf8')));
}
function write(projectPath, manifest) {
  validate(manifest);
  const file = manifestPath(projectPath);
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('Le manifeste Places ne peut pas être un lien symbolique.');
  const temp = file + `.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n');
  fs.renameSync(temp, file);
  return manifest;
}
function add(projectPath, info, role = 'place') {
  const id = normalizeRobloxId(info.placeId), universeId = normalizeRobloxId(info.gameId);
  if (!id || !universeId) throw new Error('Publie la place dans une expérience Roblox avant de la lier.');
  const manifest = read(projectPath) || { version: 1, universeId, sharedFolders: ['src'], places: [] };
  if (manifest.universeId !== universeId) throw new Error(`Cette place appartient à l’expérience ${universeId}, mais le projet est lié à ${manifest.universeId}.`);
  if (!manifest.places.some(place => place.placeId === id)) manifest.places.push({ placeId: id, name: String(info.placeName || `Place ${id}`), role: String(role || 'place').trim() || 'place', codeFolders: [placeFolder(id)] });
  return write(projectPath, manifest);
}
function remove(projectPath, placeId) {
  const manifest = read(projectPath);
  if (!manifest) throw new Error('Aucun manifeste Places.');
  manifest.places = manifest.places.filter(place => place.placeId !== String(placeId));
  return write(projectPath, manifest);
}
function sourcePath(manifest, placeId, filename) {
  const name = String(filename).replace(/\\/g, '/');
  const place = manifest?.places.find(item => item.placeId === String(placeId));
  if (!place) return null;
  const roots = [...manifest.sharedFolders, ...place.codeFolders];
  for (const root of roots) {
    const prefix = root.replace(/^src\//, '') + '/';
    if (name.startsWith(prefix)) {
      const target = name.slice(prefix.length);
      return /^[A-Za-z0-9_]+\//.test(target) && !target.split('/').includes('..') ? target : null;
    }
  }
  return null;
}
function compose(projectPath, manifest, placeId) {
  const place = manifest.places.find(item => item.placeId === String(placeId));
  if (!place) throw new Error(`PlaceId ${placeId} absent du manifeste.`);
  const result = new Map();
  for (const root of [...manifest.sharedFolders, ...place.codeFolders]) {
    const directory = path.join(projectPath, ...root.split('/'));
    if (!fs.existsSync(directory)) continue;
    const visit = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (root === 'src' && dir === directory && (entry.name === 'places' || entry.name === 'shared')) continue;
        if (entry.isSymbolicLink()) throw new Error('Lien symbolique interdit dans les sources Places.');
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (entry.isFile() && /\.luau?$/i.test(entry.name)) {
          const relative = path.relative(directory, file).replace(/\\/g, '/');
          if (!/^[A-Za-z0-9_]+\//.test(relative)) throw new Error(`Chemin Studio invalide : ${relative}`);
          if (result.has(relative)) throw new Error(`Conflit entre code commun et spécifique : ${relative}`);
          result.set(relative, fs.readFileSync(file, 'utf8'));
        }
      }
    };
    visit(directory);
  }
  return result;
}
module.exports = { FILE, manifestPath, read, write, add, remove, sourcePath, compose };
