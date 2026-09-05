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

function buildCodexMediaInstructions({ kind, label, prompt, count, sourceImage, outputPaths }) {
  const n = Math.max(1, Number(count) || 1);
  const formatInstruction = kind === 'icon'
    ? `Chaque résultat est une icône carrée destinée à représenter le jeu sur Roblox (icône d'expérience), en PNG. Compose une image forte, lisible et attractive en petit format. N'ajoute pas automatiquement de contour (stroke) autour du sujet : respecte uniquement le style demandé par l'utilisateur.`
    : `Chaque résultat est une miniature destinée à la page du jeu Roblox, au format 16:9, en PNG. Compose une scène claire, attractive et lisible dans les résultats Roblox.`;

  return [
    `Utilise obligatoirement la compétence imagegen et l'outil de génération d'images de Codex.`,
    `Tu es l'outil d'illustration de Forge, un éditeur de jeux Roblox.`,
    `Crée exactement ${n} image(s) distincte(s) de type « ${label} ».`,
    `Sujet demandé : ${prompt || '(sujet libre)'}.`,
    sourceImage
      ? `L'image jointe est la source à modifier. Respecte sa composition sauf pour les changements demandés.`
      : `Il s'agit d'une création originale sans image source.`,
    formatInstruction,
    `Enregistre ou copie les résultats exactement vers ces chemins, un fichier différent par chemin :`,
    ...(outputPaths || []).map((outputPath, index) => `${index + 1}. ${outputPath}`),
    `Vérifie que les ${n} fichiers existent avant de terminer.`,
    `Ne crée pas de faux visuel avec SVG, HTML, canvas ou un script de dessin : utilise bien la génération d'images Codex.`,
  ].join('\n');
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
  buildCodexMediaInstructions,
  findMediaItem,
  findMediaEntry,
  normalizeMediaPath,
  variantsForOutput,
  mediaFileName,
};
