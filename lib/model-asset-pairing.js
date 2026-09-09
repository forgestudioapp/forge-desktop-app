const path = require('path');

const MODEL_EXTENSIONS = new Set(['fbx', 'glb', 'gltf', 'obj']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);

function extensionOf(fileName) {
  return path.extname(String(fileName || '')).slice(1).toLowerCase();
}

function modelBaseName(fileName) {
  const ext = path.extname(String(fileName || ''));
  return path.basename(String(fileName || ''), ext)
    .replace(/(?:[-_. ]preview)$/i, '')
    .toLowerCase();
}

function isModelFile(fileName) {
  return MODEL_EXTENSIONS.has(extensionOf(fileName));
}

function isModelPreviewFile(fileName) {
  if (!IMAGE_EXTENSIONS.has(extensionOf(fileName))) return false;
  const ext = path.extname(String(fileName || ''));
  return /(?:[-_. ]preview)$/i.test(path.basename(String(fileName || ''), ext));
}

function modelArtifactKey(filePath) {
  const normalizedDirectory = path.resolve(path.dirname(String(filePath || '.'))).toLowerCase();
  return `${normalizedDirectory}|${modelBaseName(path.basename(String(filePath || '')))}`;
}

function previewCandidatesForModel(modelPath) {
  const directory = path.dirname(modelPath);
  const base = path.basename(modelPath, path.extname(modelPath));
  return ['-preview', '_preview', '.preview'].flatMap(suffix =>
    ['png', 'jpg', 'jpeg', 'webp'].map(ext => path.join(directory, `${base}${suffix}.${ext}`))
  );
}

module.exports = {
  isModelFile,
  isModelPreviewFile,
  modelArtifactKey,
  modelBaseName,
  previewCandidatesForModel,
};
