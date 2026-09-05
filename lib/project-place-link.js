const path = require('node:path');

function canonicalProjectPath(projectPath) {
  return path.resolve(String(projectPath || '')).replace(/\\/g, '/').toLowerCase();
}

function normalizeRobloxId(value) {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) && text !== '0' ? text : null;
}

function normalizePlaceInfo(placeInfo) {
  const placeId = normalizeRobloxId(placeInfo && placeInfo.placeId);
  if (!placeId) return null;
  return {
    placeId,
    gameId: normalizeRobloxId(placeInfo && placeInfo.gameId),
    placeName: String((placeInfo && placeInfo.placeName) || 'Place Roblox'),
  };
}

function linkedPlaceId(project) {
  const linked = project && project.linkedStudio;
  if (linked && typeof linked === 'object') return normalizeRobloxId(linked.placeId);
  return normalizeRobloxId(linked);
}

function evaluateProjectPlaceLink(projects, projectPath, placeInfo, now = new Date().toISOString()) {
  const place = normalizePlaceInfo(placeInfo);
  if (!place) {
    return {
      error: 'Cette place Roblox n’est pas encore publiée. Publie-la une première fois dans Studio, puis réessaie afin que Forge puisse utiliser son PlaceId.',
      code: 'place-unpublished',
    };
  }

  const targetPath = canonicalProjectPath(projectPath);
  const list = Array.isArray(projects) ? projects : [];
  const project = list.find(item => canonicalProjectPath(item.path) === targetPath);
  const currentPlaceId = linkedPlaceId(project);

  if (currentPlaceId && currentPlaceId !== place.placeId) {
    return {
      error: `Ce dossier Forge est déjà associé à une autre place Roblox (PlaceId ${currentPlaceId}). Ouvre cette place dans Studio pour continuer.`,
      code: 'project-linked-elsewhere',
    };
  }

  const conflict = list.find(item =>
    canonicalProjectPath(item.path) !== targetPath && linkedPlaceId(item) === place.placeId
  );
  if (conflict) {
    return {
      error: `La place Roblox ouverte est déjà associée au projet Forge « ${conflict.name} ». Un PlaceId ne peut appartenir qu’à un seul dossier Forge.`,
      code: 'place-linked-elsewhere',
      conflictingProject: conflict,
    };
  }

  return {
    success: true,
    alreadyLinked: currentPlaceId === place.placeId,
    link: {
      ...place,
      linkedAt: project && project.linkedStudio && project.linkedStudio.linkedAt
        ? project.linkedStudio.linkedAt
        : now,
    },
  };
}

module.exports = {
  canonicalProjectPath,
  normalizeRobloxId,
  normalizePlaceInfo,
  linkedPlaceId,
  evaluateProjectPlaceLink,
};
