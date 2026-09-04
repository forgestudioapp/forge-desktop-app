const path = require('path');

function buildCodexExec(prompt, images) {
  const args = [
    'exec',
    '--dangerously-bypass-approvals-and-sandbox',
    '--skip-git-repo-check',
    '--ephemeral',
  ];

  for (const imagePath of images || []) {
    if (typeof imagePath === 'string' && imagePath) args.push('--image', imagePath);
  }

  // Lire le prompt sur stdin évite que les caractères saisis par l'utilisateur
  // soient interprétés par le shell et contourne la limite de longueur Windows.
  args.push('-');
  return { args, stdin: String(prompt || '') };
}

function findMediaItem(manifest, kind, itemId) {
  const category = manifest && manifest.categories && manifest.categories[kind];
  if (!category || !Array.isArray(category.items)) return null;
  return category.items.find(item => item.id === itemId) || null;
}

function findMediaEntry(manifest, kind, itemId, variantId) {
  const item = findMediaItem(manifest, kind, itemId);
  if (!item) return null;
  if (!variantId) return item;
  return (item.variants || []).find(variant => variant.id === variantId) || null;
}

function normalizeMediaPath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function variantsForOutput(item, parentVariantId, parentFile) {
  const wantedParent = parentVariantId || null;
  const wantedFile = normalizeMediaPath(parentFile);
  return (item.variants || []).filter(variant => {
    const variantParent = variant.parentVariantId || null;
    if (variantParent !== wantedParent) return false;
    if (!variant.parentFile) {
      const parentEntry = wantedParent
        ? (item.variants || []).find(candidate => candidate.id === wantedParent)
        : item;
      return normalizeMediaPath((parentEntry && parentEntry.files || [])[0]) === wantedFile;
    }
    return normalizeMediaPath(variant.parentFile) === wantedFile;
  });
}

function mediaFileName(relativePath) {
  return path.basename(normalizeMediaPath(relativePath));
}

module.exports = {
  buildCodexExec,
  findMediaItem,
  findMediaEntry,
  normalizeMediaPath,
  variantsForOutput,
  mediaFileName,
};
