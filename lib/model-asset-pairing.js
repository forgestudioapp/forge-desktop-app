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

// Images in models/ belong to a 3D delivery (palette, texture, QA view, etc.).
// Standalone images belong in assets/ and must keep their own notifications.
function isModelSupportFile(filePath, projectPath) {
  if (!projectPath || !IMAGE_EXTENSIONS.has(extensionOf(filePath))) return false;
  const relative = path.relative(path.resolve(projectPath, 'models'), path.resolve(filePath));
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
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
  isModelSupportFile,
  modelArtifactKey,
  modelBaseName,
  previewCandidatesForModel,
};
