const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  isModelFile,
  isModelPreviewFile,
  modelArtifactKey,
  previewCandidatesForModel,
} = require('./model-asset-pairing');

test('reconnaît un aperçu Blender comme auxiliaire du modèle', () => {
  assert.equal(isModelPreviewFile('stylized-tree-preview.png'), true);
  assert.equal(isModelPreviewFile('stylized-tree.png'), false);
  assert.equal(isModelFile('stylized-tree.fbx'), true);
});

test('associe le FBX, le GLB et leur aperçu à un seul artefact', () => {
  const dir = path.join('C:', 'ForgeProjects', 'tree', 'models');
  assert.equal(
    modelArtifactKey(path.join(dir, 'stylized-tree.fbx')),
    modelArtifactKey(path.join(dir, 'stylized-tree-preview.png'))
  );
  assert.equal(
    modelArtifactKey(path.join(dir, 'stylized-tree.glb')),
    modelArtifactKey(path.join(dir, 'stylized-tree.fbx'))
  );
});

test('cherche les aperçus placés à côté du modèle', () => {
  const candidates = previewCandidatesForModel(path.join('C:', 'game', 'models', 'tree.fbx'));
  assert.ok(candidates.some(candidate => candidate.endsWith(path.join('models', 'tree-preview.png'))));
});
