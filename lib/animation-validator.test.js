const test = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('three');
const { validateAnimations, checkLoopContinuity, generateReport } = require('./animation-validator');
const track = name => new THREE.VectorKeyframeTrack(name, [0, 1], [0, 0, 0, 0, 0, 0]);
const clip = tracks => new THREE.AnimationClip('test', 1, tracks);

test('object animation resolves names, UUIDs and directory-qualified bindings without requiring a skeleton', () => {
  const root = new THREE.Group(), child = new THREE.Object3D();
  child.name = 'part'; root.add(child);
  for (const name of ['part.position', child.uuid + '.position', 'parent/part.position', '.position']) {
    const result = validateAnimations([clip([track(name)])], null, root);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.summary.hasSkinnedMesh, false);
  }
  assert.equal(validateAnimations([clip([track('missing.position')])], null, root).valid, false);
});

test('malformed clips and nonfinite, unordered or incomplete tracks are rejected without throwing', () => {
  for (const bad of [null, { duration: NaN, tracks: [] }, { duration: 1, tracks: {} },
    { duration: 1, tracks: [null] },
    clip([{ name: '.position', times: [0, 1], values: [0, 1, 2], ValueTypeName: 'vector' }]),
    clip([{ name: '.position', times: [1, 0], values: [0, 0, 0, 0, 0, 0], ValueTypeName: 'vector' }]),
    clip([{ name: '.position', times: [0, 1], values: [0, 0, 0, NaN, 0, 0], ValueTypeName: 'vector' }]),
    clip([new THREE.QuaternionKeyframeTrack('.quaternion', [0, 1], [0, 0, 0, 0, 0, 0, 0, 1])])]) {
    assert.equal(validateAnimations([bad]).valid, false);
  }
});

test('loop checks support scalar values and equivalent quaternion signs, but never certify partial coverage', () => {
  assert.equal(checkLoopContinuity(clip([new THREE.NumberKeyframeTrack('.opacity', [0, 1], [1, 1])])).continuous, true);
  assert.equal(checkLoopContinuity(clip([new THREE.QuaternionKeyframeTrack('.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, -1])])).continuous, true);
  const partial = clip([track('.position'), new THREE.NumberKeyframeTrack('.opacity', [0, 0.5], [1, 1])]);
  assert.equal(checkLoopContinuity(partial).verified, false);
  assert.equal(checkLoopContinuity(partial).continuous, null);
  assert.equal(checkLoopContinuity(clip([new THREE.NumberKeyframeTrack('.opacity', [0, 1], [0, 1])])).continuous, false);
});

function rig(normalized = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array(12).fill(0), 4));
  geometry.setAttribute('skinWeight', normalized
    ? new THREE.Uint8BufferAttribute([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0], 4, true)
    : new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  const bone = new THREE.Bone(); bone.name = 'root'; mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  return mesh;
}

test('real skinned meshes validate normalized integer weights and reject missing bones or bad sums', () => {
  for (const normalized of [false, true]) {
    const mesh = rig(normalized);
    const result = validateAnimations([clip([track('root.position')])], mesh.skeleton, mesh);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.summary.skinVerticesChecked, 3);
    mesh.geometry.attributes.skinIndex.setX(0, 3);
    assert.match(validateAnimations([clip([track('root.position')])], mesh.skeleton, mesh).errors.join(), /os absent/);
  }
  const mesh = rig(); mesh.geometry.attributes.skinWeight.setX(0, 0.5);
  assert.match(validateAnimations([clip([track('root.position')])], null, mesh).errors.join(), /somme des poids/);
  mesh.geometry.deleteAttribute('skinWeight');
  assert.match(validateAnimations([clip([track('root.position')])], null, mesh).errors.join(), /Attributs de skinning absents/);
});

test('bone cycles terminate with an error and grouped root bones are not called orphaned', () => {
  const a = { name: 'a', isBone: true }, b = { name: 'b', isBone: true }; a.parent = b; b.parent = a;
  assert.match(validateAnimations([clip([track('.position')])], { bones: [a, b] }).errors.join(), /Cycle/);
  const mesh = rig();
  assert.deepEqual(validateAnimations([clip([track('root.position')])], mesh.skeleton, mesh).warnings, []);
});

test('report distinguishes key rate from runtime FPS and exposes checks that were not performed', () => {
  const result = validateAnimations([clip([track('.position')])]);
  assert.equal(result.summary.animations[0].keyRate, 1);
  assert.equal(result.summary.animations[0].fps, undefined);
  assert.match(generateReport(result), /ne mesure pas les FPS/);
  assert.match(generateReport(result), /Contacts au sol/);
});
