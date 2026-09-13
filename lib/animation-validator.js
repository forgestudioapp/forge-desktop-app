(function(root, factory) {
  const api = factory(() => typeof module === 'object' && module.exports ? require('three') : root.THREE);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ForgeAnimationValidator = api;
})(typeof window === 'object' ? window : globalThis, function(getThree) {
  const MAX_VERTICES = 200000;
  const MAX_KEYS = 1000000;
  const components = ['getX', 'getY', 'getZ', 'getW'];

  function inspectTrack(track, duration) {
    const issues = [];
    const times = track?.times, values = track?.values;
    if (!times?.length || !values?.length) return { issues: ['Piste sans clés ou valeurs'], stride: 0, keyRate: null };
    if (times.length > MAX_KEYS || values.length > MAX_KEYS * 16) return { issues: ['Piste trop volumineuse pour ce contrôle'], stride: 0, keyRate: null, incomplete: true };
    const stride = values.length / times.length;
    if (!Number.isInteger(stride) || stride < 1) issues.push('Nombre de valeurs incompatible avec les clés');
    if (track.ValueTypeName === 'quaternion' && stride !== 4) issues.push('Quaternion incomplet');
    if (track.ValueTypeName === 'vector' && stride !== 3) issues.push('Vecteur incomplet');
    let interval = null, regular = true;
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      if (!Number.isFinite(t) || t < 0 || t > duration + 1e-5) { issues.push('Temps hors du clip ou non fini'); break; }
      if (i) {
        const gap = t - times[i - 1];
        if (gap <= 0) { issues.push('Clés non strictement croissantes'); break; }
        if (interval === null) interval = gap;
        else if (Math.abs(gap - interval) > Math.max(1e-5, interval * 0.001)) regular = false;
      }
    }
    const discrete = track.ValueTypeName === 'string' || track.ValueTypeName === 'bool';
    if (!discrete) {
      for (let i = 0; i < values.length; i++) {
        if (!Number.isFinite(values[i])) { issues.push('Valeur non finie'); break; }
      }
    }
    if (track.ValueTypeName === 'quaternion' && stride === 4) {
      for (let i = 0; i < values.length; i += 4) {
        const length = Math.hypot(values[i], values[i + 1], values[i + 2], values[i + 3]);
        if (!Number.isFinite(length) || length < 1e-8 || Math.abs(length - 1) > 0.01) { issues.push('Quaternion nul ou non normalisé'); break; }
      }
    }
    return { issues, stride, keyRate: regular && interval > 0 ? 1 / interval : null };
  }

  function checkLoopContinuity(animation, tolerance = 0.01) {
    const base = { continuous: null, verified: false, tracksCompared: 0, tracksSkipped: 0, maxDifference: 0, tolerance };
    if (!Number.isFinite(animation?.duration) || animation.duration <= 0 || !Array.isArray(animation.tracks) || !animation.tracks.length) return { ...base, reason: 'Clip absent ou invalide' };
    for (const track of animation.tracks) {
      const analysis = inspectTrack(track, animation.duration);
      const { times, values } = track || {};
      if (analysis.issues.length || times[0] > 1e-5 || Math.abs(animation.duration - times[times.length - 1]) > 1e-5) {
        base.tracksSkipped++;
        continue;
      }
      const stride = analysis.stride;
      let direct = 0, negated = 0;
      for (let i = 0; i < stride; i++) {
        const a = values[i], b = values[values.length - stride + i];
        const numeric = typeof a === 'number' && typeof b === 'number';
        direct = Math.max(direct, numeric ? Math.abs(a - b) : Number(a !== b));
        if (track.ValueTypeName === 'quaternion') negated = Math.max(negated, Math.abs(a + b));
      }
      const difference = track.ValueTypeName === 'quaternion' ? Math.min(direct, negated) : direct;
      base.maxDifference = Math.max(base.maxDifference, difference);
      base.tracksCompared++;
    }
    base.verified = base.tracksCompared > 0 && base.tracksSkipped === 0;
    base.continuous = base.maxDifference > tolerance ? false : base.verified ? true : null;
    return { ...base, reason: base.verified ? undefined : 'Certaines pistes ne peuvent pas être comparées aux bornes' };
  }

  function attributeValue(attribute, index, component) {
    if (attribute.normalized) {
      const array = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
      const offset = attribute.isInterleavedBufferAttribute ? index * attribute.data.stride + attribute.offset : index * attribute.itemSize;
      const raw = array[offset + component];
      const type = array.constructor.name;
      const divisor = { Uint8Array: 255, Uint8ClampedArray: 255, Uint16Array: 65535, Uint32Array: 4294967295,
        Int8Array: 127, Int16Array: 32767, Int32Array: 2147483647 }[type];
      return divisor ? Math.max(raw / divisor, -1) : raw;
    }
    return typeof attribute[components[component]] === 'function'
      ? attribute[components[component]](index)
      : attribute.array[index * attribute.itemSize + component];
  }

  function inspectSkin(mesh, results) {
    const bones = mesh.skeleton?.bones || [];
    const geometry = mesh.geometry;
    const weights = geometry?.attributes?.skinWeight, indices = geometry?.attributes?.skinIndex;
    const count = geometry?.attributes?.position?.count;
    const issue = message => results.errors.push(`Mesh "${mesh.name || 'sans nom'}": ${message}`);
    if (!bones.length) issue('Squelette absent');
    if (!weights || !indices || !Number.isInteger(count) || count < 1) { issue('Attributs de skinning absents'); return; }
    if (weights.count !== count || indices.count !== count || weights.itemSize !== indices.itemSize || weights.itemSize !== 4) {
      issue('Attributs de skinning incompatibles avec les sommets'); return;
    }
    const available = Math.max(0, MAX_VERTICES - results.summary.skinVerticesChecked);
    const inspectCount = Math.min(count, available);
    if (inspectCount < count) results.incomplete = true;
    let badWeights = 0, badIndices = 0, badSums = 0;
    for (let v = 0; v < inspectCount; v++) {
      let sum = 0, weightInvalid = false, indexInvalid = false;
      for (let c = 0; c < 4; c++) {
        const weight = attributeValue(weights, v, c);
        const index = attributeValue(indices, v, c);
        if (!Number.isFinite(weight) || weight < 0 || weight > 1) weightInvalid = true;
        sum += weight;
        if (weight > 0 && (!Number.isInteger(index) || index < 0 || index >= bones.length)) indexInvalid = true;
      }
      if (weightInvalid) badWeights++;
      if (indexInvalid) badIndices++;
      if (!Number.isFinite(sum) || Math.abs(sum - 1) > 0.001) badSums++;
    }
    results.summary.skinVerticesChecked += inspectCount;
    if (badWeights) issue(`${badWeights} sommet(s) avec poids invalides`);
    if (badIndices) issue(`${badIndices} sommet(s) pointant vers un os absent`);
    if (badSums) issue(`${badSums} sommet(s) avec somme des poids différente de 1`);
  }

  function validateAnimations(animations, skeleton, model) {
    const clips = Array.isArray(animations) ? animations : [];
    const results = {
      valid: true, incomplete: false, errors: [], warnings: [], info: [],
      unverified: ['Déformations pendant le mouvement', 'Contacts au sol', 'Rendu dans Roblox'],
      summary: { totalAnimations: clips.length, totalBones: 0, hasSkinnedMesh: false, maxBonesPerMesh: 0, skinVerticesChecked: 0, animations: [] }
    };
    const skeletons = new Set(skeleton ? [skeleton] : []);
    if (model?.traverse) model.traverse(node => {
      if (node.isSkinnedMesh) {
        results.summary.hasSkinnedMesh = true;
        if (node.skeleton) skeletons.add(node.skeleton);
        results.summary.maxBonesPerMesh = Math.max(results.summary.maxBonesPerMesh, node.skeleton?.bones?.length || 0);
        inspectSkin(node, results);
      }
    });
    if (!model) results.unverified.push('Poids et présence de meshes skinnés (modèle non fourni)');
    const uniqueBones = new Set();
    for (const rig of skeletons) {
      const bones = rig.bones || [], boneSet = new Set(bones), names = new Set();
      for (const bone of bones) {
        uniqueBones.add(bone);
        if (names.has(bone.name)) results.errors.push(`Nom d'os dupliqué dans un squelette : ${bone.name}`);
        names.add(bone.name);
        if (bone.parent?.isBone && !boneSet.has(bone.parent)) results.warnings.push(`Parent d'os absent du squelette : ${bone.name}`);
        const visited = new Set();
        let current = bone;
        while (current && boneSet.has(current)) {
          if (visited.has(current)) { results.errors.push(`Cycle dans le squelette : ${bone.name}`); break; }
          visited.add(current); current = current.parent;
        }
      }
    }
    results.summary.totalBones = uniqueBones.size;
    if (!clips.length) results.errors.push('Aucune animation trouvée dans le modèle');
    for (const clip of clips) {
      const info = { name: clip?.name || 'Unnamed', duration: Number.isFinite(clip?.duration) ? clip.duration : 0,
        tracks: clip?.tracks?.length || 0, keyRate: null, loopable: false, issues: [] };
      if (!Number.isFinite(clip?.duration) || clip.duration <= 0) info.issues.push('Durée invalide');
      if (!Array.isArray(clip?.tracks) || !clip.tracks.length) info.issues.push('Aucune piste');
      const rates = [];
      const trackNames = new Set();
      for (const track of Array.isArray(clip?.tracks) ? clip.tracks : []) {
        const analysis = inspectTrack(track, clip.duration);
        info.issues.push(...analysis.issues.map(issue => `${track?.name || 'piste'} : ${issue}`));
        if (analysis.incomplete) results.incomplete = true;
        rates.push(analysis.keyRate);
        if (trackNames.has(track?.name)) info.issues.push(`Piste dupliquée : ${track?.name}`);
        trackNames.add(track?.name);
        // Object transforms can animate without a skeleton; do not call every position track root motion.
        const binding = getThree()?.PropertyBinding;
        if (model && binding) {
          try {
            const parsed = binding.parseTrackName(track?.name || '');
            const target = binding.findNode(model, parsed.nodeName);
            if (!target) info.issues.push(`Objet animé introuvable : ${parsed.nodeName}`);
            else if (parsed.objectName === 'bones' && !target.skeleton?.bones?.some((bone, i) => bone.name === parsed.objectIndex || String(i) === parsed.objectIndex)) {
              info.issues.push(`Os animé introuvable : ${parsed.objectIndex}`);
            }
          } catch (_) { info.issues.push('Nom de piste invalide'); }
        } else if (model) {
          results.unverified.push('Cibles des pistes (Three.js indisponible)');
        }
      }
      if (rates.length && rates.every(rate => rate && Math.abs(rate - rates[0]) < 0.01)) info.keyRate = rates[0];
      const loop = checkLoopContinuity(clip);
      info.loopContinuous = loop.continuous; info.loopVerified = loop.verified;
      info.loopMaxDiff = loop.maxDifference; info.loopTracksCompared = loop.tracksCompared;
      info.loopable = !info.issues.length && loop.continuous === true && loop.verified;
      if (loop.continuous === false) results.warnings.push(`Animation "${info.name}" : poses différentes au début et à la fin`);
      else if (!loop.verified) results.warnings.push(`Animation "${info.name}" : boucle non entièrement vérifiée`);
      results.errors.push(...info.issues.map(issue => `Animation "${info.name}" : ${issue}`));
      results.summary.animations.push(info);
    }
    results.errors = [...new Set(results.errors)];
    results.valid = !results.errors.length && !results.incomplete;
    if (results.incomplete) results.warnings.push('Contrôle partiel : limite de taille atteinte');
    return results;
  }

  function generateReport(result) {
    const lines = ['=== CONTRÔLE TECHNIQUE DES ANIMATIONS ===',
      `Contrôles locaux : ${result.valid ? 'réussis' : result.incomplete ? 'incomplets' : 'défauts détectés'}`,
      `Animations : ${result.summary.totalAnimations} ; os : ${result.summary.totalBones}`,
      `SkinnedMesh présent : ${result.summary.hasSkinnedMesh ? 'oui' : 'non confirmé'}`,
      `Sommets contrôlés pour le skinning : ${result.summary.skinVerticesChecked || 0}`];
    for (const error of result.errors) lines.push(`Erreur : ${error}`);
    for (const warning of result.warnings) lines.push(`À vérifier : ${warning}`);
    for (const clip of result.summary.animations) {
      lines.push(`${clip.name} : ${clip.duration.toFixed(2)}s, ${clip.tracks} piste(s)`);
      if (clip.keyRate) lines.push(`  Cadence des clés : ~${clip.keyRate.toFixed(1)}/s (ne mesure pas les FPS du jeu)`);
      lines.push(`  Boucle : ${clip.loopVerified ? clip.loopContinuous ? 'continue aux bornes' : 'discontinue' : 'non entièrement vérifiée'}`);
    }
    if (result.unverified?.length) lines.push('Non vérifié : ' + result.unverified.join(' ; '));
    return lines.join('\n');
  }
  return { validateAnimations, checkLoopContinuity, generateReport };
});
