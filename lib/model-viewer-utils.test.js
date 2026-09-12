const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('three');
const utils = require('./model-viewer-utils');

test('exact selected file uses the correct loader and preserves reserved characters and clips', () => {
  const calls = [], model = {}, clips = [{}];
  const loaders = {
    FBXLoader: class { load(url, callback) { calls.push(['fbx', url]); callback({ ...model, animations: clips }); } },
    GLTFLoader: class { load(url, callback) { calls.push(['gltf', url]); callback({ scene: model, animations: clips }); } },
  };
  for (const ext of ['fbx', 'glb', 'gltf']) {
    utils.load(loaders, `C:\\Models\\test #1%.${ext}`, (_, animations) => assert.equal(animations, clips), assert.fail);
  }
  assert.deepEqual(calls, [
    ['fbx', 'file:///C:/Models/test%20%231%25.fbx'],
    ['gltf', 'file:///C:/Models/test%20%231%25.glb'],
    ['gltf', 'file:///C:/Models/test%20%231%25.gltf'],
  ]);
});

test('shared mesh geometry, materials and textures are disposed once', () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry(), texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  let geometries = 0, materials = 0, textures = 0;
  geometry.addEventListener('dispose', () => geometries++);
  material.addEventListener('dispose', () => materials++);
  texture.addEventListener('dispose', () => textures++);
  root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, [material, material]));
  utils.disposeObject(root);
  assert.deepEqual([geometries, materials, textures], [1, 1, 1]);
});

function viewer() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'workspace.html'), 'utf8');
  const source = html.slice(html.indexOf('function loadFBXViewer('), html.indexOf('// Keyboard shortcuts', html.indexOf('function loadFBXViewer(')));
  const frames = new Map(), listeners = new Map();
  const state = { renders: 0, disposed: 0, lost: 0, controlsDisposed: 0, pixelRatio: 0 };
  const document = { hidden: false, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
  let loaded, failed, next = 0;
  const api = vm.runInNewContext(source + ';loadFBXViewer;', {
    THREE: { ...THREE,
      WebGLRenderer: class {
        constructor(options) { this.domElement = options.canvas; }
        setSize() {} setPixelRatio(value) { state.pixelRatio = value; }
        render() { state.renders++; } dispose() { state.disposed++; } forceContextLoss() { state.lost++; }
      },
      OrbitControls: class {
        constructor() { this.target = new THREE.Vector3(); }
        update() {} dispose() { state.controlsDisposed++; }
      },
    },
    ForgeModelViewer: { ...utils, load: (_, file, ok, error) => { loaded = ok; failed = error; } },
    document, window: { devicePixelRatio: 3 },
    requestAnimationFrame: callback => { frames.set(++next, callback); return next; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  const canvas = { width: 400, height: 300, isConnected: true };
  api(canvas, 'C:/fixture.fbx');
  return { canvas, state, document, frames, listeners, load: model => loaded(model), fail: () => failed() };
}

test('closing before a model finishes loading never restarts rendering and releases the late model', () => {
  const v = viewer();
  v.canvas._fbxStop();
  const model = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  let disposed = 0;
  model.geometry.addEventListener('dispose', () => disposed++);
  v.load(model);
  assert.equal(disposed, 1);
  assert.equal(v.state.renders, 0);
  assert.equal(v.frames.size, 0);
  assert.equal(v.state.disposed, 1);
  assert.equal(v.state.lost, 1);
});

test('hidden view pauses rendering, visible view resumes once, closure cleans up original materials', () => {
  const v = viewer();
  const material = new THREE.MeshBasicMaterial(), model = new THREE.Mesh(new THREE.BoxGeometry(), material);
  model.position.set(1, 2, 3); model.scale.setScalar(2);
  v.load(model);
  assert.equal(model.material, material);
  assert.deepEqual(model.position.toArray(), [1, 2, 3]);
  assert.deepEqual(model.scale.toArray(), [2, 2, 2]);
  assert.equal(v.state.pixelRatio, 2);
  assert.equal(v.frames.size, 1);
  v.document.hidden = true; v.listeners.get('visibilitychange')();
  assert.equal(v.frames.size, 0);
  v.document.hidden = false; v.listeners.get('visibilitychange')();
  v.listeners.get('visibilitychange')();
  assert.equal(v.frames.size, 1);
  let disposed = 0; material.addEventListener('dispose', () => disposed++);
  v.canvas._fbxStop(); v.canvas._fbxStop();
  assert.equal(disposed, 1);
  assert.equal(v.frames.size, 0);
  assert.equal(v.listeners.size, 0);
  assert.equal(v.state.controlsDisposed, 1);
});

test('failed model loads release the renderer even when no model was returned', () => {
  const v = viewer(); v.fail();
  assert.equal(v.state.disposed, 1);
  assert.equal(v.listeners.size, 0);
  assert.match(v.canvas.outerHTML, /Impossible de charger/);
});
