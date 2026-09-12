(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ForgeModelViewer = api;
})(typeof window === 'object' ? window : globalThis, function() {
  function load(THREE, filePath, onModel, onError) {
    const ext = filePath.split('.').pop().toLowerCase();
    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const url = 'file:///' + normalized.split('/').map(encodeURIComponent).join('/').replace(/^([a-z])%3A/i, '$1:');
    try {
      if ((ext === 'glb' || ext === 'gltf') && THREE.GLTFLoader) {
        new THREE.GLTFLoader().load(url, result => onModel(result.scene, result.animations || []), undefined, onError);
      } else if (ext === 'fbx' && THREE.FBXLoader) {
        new THREE.FBXLoader().load(url, result => onModel(result, result.animations || []), undefined, onError);
      } else onError(new Error('Format ou lecteur 3D indisponible'));
    } catch (error) { onError(error); }
  }

  // Resources may be shared by many meshes. Release each exactly once.
  function disposeObject(object) {
    const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
    object.traverse(child => {
      if (child.geometry) geometries.add(child.geometry);
      if (child.skeleton) skeletons.add(child.skeleton);
      for (const material of (Array.isArray(child.material) ? child.material : [child.material])) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        for (const uniform of Object.values(material.uniforms || {})) {
          for (const value of (Array.isArray(uniform.value) ? uniform.value : [uniform.value])) if (value?.isTexture) textures.add(value);
        }
      }
    });
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const skeleton of skeletons) skeleton.dispose?.();
  }
  return { load, disposeObject };
});
