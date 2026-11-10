'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TYPES = Object.freeze(['image', 'audio', 'model3d', 'animation', 'vfx', 'interface']);
const STATES = Object.freeze(['in-progress', 'draft', 'needs-review', 'validated', 'rejected', 'failed', 'published']);
const EXTENSIONS = Object.freeze({ image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'], model3d: ['.fbx', '.glb', '.gltf', '.obj'] });

function catalogFile(projectPath) { return path.join(projectPath, '.forge-assets', 'catalog.json'); }
function readCatalog(projectPath) {
  try { const value = JSON.parse(fs.readFileSync(catalogFile(projectPath), 'utf8')); return value.version === 1 && Array.isArray(value.assets) ? value : { version: 1, assets: [] }; }
  catch (_) { return { version: 1, assets: [] }; }
}
function saveCatalog(projectPath, catalog) {
  const file = catalogFile(projectPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(catalog, null, 2)); fs.renameSync(temporary, file); }
  catch (error) { try { fs.rmSync(temporary, { force: true }); } catch (_) {} throw error; }
}
function localFile(projectPath, filePath) {
  const root = fs.realpathSync(projectPath);
  const file = fs.realpathSync(path.isAbsolute(filePath) ? filePath : path.join(root, filePath));
  if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) throw new Error('Fichier hors du projet.');
  return { absolute: file, relative: path.relative(root, file).replace(/\\/g, '/') };
}
function hashFile(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function typeForFile(file) {
  const ext = path.extname(file).toLowerCase();
  return Object.keys(EXTENSIONS).find(type => EXTENSIONS[type].includes(ext)) || null;
}
function discoverLocalAssets(projectPath) {
  const folders = ['assets', 'thumbnails', 'icons', 'gui-icons', 'models', 'conversions'];
  const existing = readCatalog(projectPath);
  const known = new Set([...existing.assets.map(item => item.localFile), ...(existing.hiddenFiles || [])]);
  let added = 0;
  for (const folder of folders) {
    const directory = path.join(projectPath, folder);
    if (!fs.existsSync(directory)) continue;
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!item.isFile() || item.name.endsWith('-preview.png')) continue;
      const file = path.join(directory, item.name);
      const type = typeForFile(file);
      if (!type || (folder === 'models' && type !== 'model3d')) continue;
      const relative = `${folder}/${item.name}`;
      if (known.has(relative)) continue;
      recordAssetFile(projectPath, { filePath: file, type, status: 'draft', agent: 'Import local', provider: 'Fichier local' });
      known.add(relative); added++;
    }
  }
  return added;
}
function recordAssetFile(projectPath, input) {
  const source = localFile(projectPath, input.filePath);
  const type = input.type || typeForFile(source.absolute);
  if (!TYPES.includes(type)) throw new Error('Type d’asset inconnu.');
  if (EXTENSIONS[type] && !EXTENSIONS[type].includes(path.extname(source.absolute).toLowerCase())) throw new Error('Format de fichier incompatible.');
  const catalog = readCatalog(projectPath);
  if (Array.isArray(catalog.hiddenFiles)) catalog.hiddenFiles = catalog.hiddenFiles.filter(item => item !== source.relative);
  let asset = input.assetId ? catalog.assets.find(item => item.id === input.assetId) : catalog.assets.find(item => item.localFile === source.relative);
  if (input.assetId && !asset) throw new Error('Asset introuvable.');
  if (asset && asset.type !== type) throw new Error('Type d’asset différent.');
  const digest = hashFile(source.absolute);
  if (asset && asset.revisions.at(-1)?.sha256 === digest && asset.revisions.at(-1)?.file === source.relative) {
    if (!asset.prompt && input.prompt) asset.prompt = String(input.prompt).slice(0, 2000);
    if (!asset.provider && input.provider) asset.provider = String(input.provider).slice(0, 100);
    saveCatalog(projectPath, catalog);
    return asset;
  }
  const now = new Date().toISOString();
  if (!asset) {
    asset = { id: crypto.randomUUID(), type, name: String(input.name || path.basename(source.absolute, path.extname(source.absolute))).slice(0, 160), localFile: source.relative, agent: String(input.agent || 'Utilisateur').slice(0, 100), prompt: String(input.prompt || '').slice(0, 2000), provider: String(input.provider || '').slice(0, 100), cost: input.cost ?? null, createdAt: now, status: 'draft', revisions: [], robloxAssetId: null, uploadError: null, insertion: null };
    catalog.assets.push(asset);
  }
  const number = asset.revisions.length + 1;
  const snapshot = path.join('.forge-assets', 'revisions', asset.id, `${number}${path.extname(source.absolute).toLowerCase()}`).replace(/\\/g, '/');
  const destination = path.join(projectPath, ...snapshot.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source.absolute, destination);
  const revision = { id: crypto.randomUUID(), number, file: source.relative, snapshot, sha256: digest, prompt: String(input.prompt ?? asset.prompt).slice(0, 2000), provider: String(input.provider ?? asset.provider).slice(0, 100), cost: input.cost ?? null, createdAt: now, status: input.status === 'draft' ? 'draft' : 'needs-review' };
  if (asset.revisions.at(-1)?.status === 'in-progress') asset.revisions.pop();
  asset.revisions.push(revision);
  asset.localFile = source.relative;
  asset.status = revision.status;
  asset.robloxAssetId = null;
  asset.uploadError = null;
  saveCatalog(projectPath, catalog);
  return asset;
}
function updateAsset(projectPath, id, action, options = {}) {
  const catalog = readCatalog(projectPath);
  const asset = catalog.assets.find(item => item.id === id);
  if (!asset) throw new Error('Asset introuvable.');
  if (action === 'accept') {
    if (!['draft', 'needs-review', 'rejected', 'failed'].includes(asset.status) || !asset.revisions.at(-1)?.file) throw new Error('Révision non prête à valider.');
    asset.status = 'validated'; asset.revisions.at(-1).status = 'validated'; asset.validatedAt = new Date().toISOString();
  } else if (action === 'reject') {
    if (asset.status === 'published') throw new Error('Un asset publié ne peut pas être refusé.');
    asset.status = 'rejected'; asset.revisions.at(-1).status = 'rejected';
  } else if (action === 'fail') {
    asset.status = 'failed'; asset.revisions.at(-1).status = 'failed';
    asset.error = String(options.error || 'Génération échouée.').slice(0, 500);
  } else if (action === 'redo') {
    if (asset.status === 'in-progress') throw new Error('Une nouvelle révision est déjà en cours.');
    if (asset.status === 'published' && asset.revisions.at(-1)) asset.revisions.at(-1).robloxAssetId = asset.robloxAssetId;
    asset.robloxAssetId = null;
    asset.revisions.push({ id: crypto.randomUUID(), number: asset.revisions.length + 1, file: null, snapshot: null, sha256: null, prompt: String(options.prompt ?? asset.prompt).slice(0, 2000), provider: asset.provider, cost: null, createdAt: new Date().toISOString(), status: 'in-progress' });
    asset.status = 'in-progress';
  } else if (action === 'delete') {
    catalog.hiddenFiles = [...new Set([...(catalog.hiddenFiles || []), asset.localFile])];
    catalog.assets = catalog.assets.filter(item => item.id !== id);
    saveCatalog(projectPath, catalog);
    return { ...asset, deleted: true };
  } else throw new Error('Action inconnue.');
  saveCatalog(projectPath, catalog);
  return asset;
}
async function publishAsset(projectPath, id, upload, insert = null) {
  const catalog = readCatalog(projectPath);
  const asset = catalog.assets.find(item => item.id === id);
  if (!asset) throw new Error('Asset introuvable.');
  if (asset.status === 'published' && asset.robloxAssetId) return asset;
  if (asset.status !== 'validated') throw new Error('Validation explicite requise avant publication Roblox.');
  if (!['image', 'model3d'].includes(asset.type)) throw new Error('Publication Roblox non prise en charge pour ce type.');
  const source = localFile(projectPath, asset.localFile);
  const revision = asset.revisions.at(-1);
  if (hashFile(source.absolute) !== revision?.sha256) throw new Error('Le fichier a changé depuis sa validation. Valide la nouvelle révision.');
  const result = await upload(source.absolute, asset.name);
  const current = readCatalog(projectPath);
  const latest = current.assets.find(item => item.id === id);
  if (!latest || latest.status !== 'validated' || latest.revisions.at(-1)?.id !== revision.id) throw new Error('La révision a changé pendant l’upload. L’identifiant Roblox doit être vérifié avant une nouvelle publication.');
  if (!result || result.error || !result.assetId) {
    latest.uploadError = result?.error || 'Upload Roblox sans identifiant.';
    saveCatalog(projectPath, current);
    throw new Error(latest.uploadError);
  }
  latest.robloxAssetId = String(result.assetId);
  latest.status = 'published';
  latest.revisions.at(-1).status = 'published';
  latest.revisions.at(-1).robloxAssetId = latest.robloxAssetId;
  latest.uploadError = null;
  latest.publishedAt = new Date().toISOString();
  saveCatalog(projectPath, current);
  if (insert) {
    try { latest.insertion = await insert(latest); }
    catch (error) { latest.insertion = { confirmed: false, error: error.message }; }
    const afterInsertion = readCatalog(projectPath);
    const persisted = afterInsertion.assets.find(item => item.id === id);
    if (persisted) { persisted.insertion = latest.insertion; saveCatalog(projectPath, afterInsertion); }
  }
  return latest;
}

module.exports = { TYPES, STATES, EXTENSIONS, readCatalog, recordAssetFile, updateAsset, publishAsset, localFile, typeForFile, discoverLocalAssets };
