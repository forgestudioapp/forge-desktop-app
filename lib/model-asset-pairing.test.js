const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  isModelFile,
  isModelPreviewFile,
  isModelSupportFile,
  modelArtifactKey,
  previewCandidatesForModel,
} = require('./model-asset-pairing');

test('regroupe les palettes, textures et contrôles avant même la création du FBX', () => {
  const project = path.resolve('game');
  for (const file of ['nimbo-palette.png', 'nimbo-qa-front.png', 'textures/color.png', 'nimbo-monster-preview.png']) {
    assert.equal(isModelSupportFile(path.join(project, 'models', file), project), true);
  }
  for (const file of ['assets/palette.png', 'assets/nimbo-qa-front.png', 'models-other/color.png', 'models/tree.fbx']) {
    assert.equal(isModelSupportFile(path.join(project, file), project), false);
  }
  assert.equal(isModelSupportFile(path.join(project, 'models', 'image.png'), ''), false);
});

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
