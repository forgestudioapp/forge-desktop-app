'use strict';
const path = require('node:path');

const LABELS = Object.freeze({
  preparing: 'Préparation',
  compiling: 'Compilation en cours',
  'compile-error': 'Compilation à corriger',
  'waiting-studio': 'En attente de Studio',
  'wrong-place': 'Mauvaise place ouverte',
  syncing: 'Synchronisation en cours',
  synced: 'Synchronisé',
  paused: 'Synchronisation en pause',
  error: 'Erreur',
});

function projectHealth(project, sync = {}, studio = {}) {
  const link = project?.linkedStudio;
  const linked = link && typeof link === 'object' ? link : { placeId: link || null };
  const placeId = linked.placeId ? String(linked.placeId) : null;
  const displayLink = studio.ready && studio.link ? studio.link : linked;
  const studioCode = studio.code || (studio.ready ? 'ready' : 'studio-unavailable');
  let state;
  if (!project) state = 'error';
  else if (studioCode === 'project-linked-elsewhere' || studioCode === 'place-linked-elsewhere') state = 'wrong-place';
  else if (sync.phase === 'compile-error') state = 'compile-error';
  else if (sync.phase === 'error') state = 'error';
  else if (project.syncPaused !== false || !placeId || sync.phase === 'paused' || sync.phase === 'local') state = 'paused';
  else if (sync.phase === 'compiling') state = 'compiling';
  else if (!studio.ready) state = 'waiting-studio';
  else if (sync.phase === 'syncing') state = 'syncing';
  else if (sync.phase === 'waiting-studio' && sync.error) state = 'error';
  else if (sync.phase === 'synced' && Number(sync.pending || 0) === 0 && sync.lastValidBuildId && sync.candidateBuildId === sync.lastValidBuildId) state = 'synced';
  else state = 'preparing';

  const error = sync.error || studio.error || null;
  const errorFile = sync.errorFile || null;
  let explanation = '';
  if (state === 'compile-error') explanation = errorFile ? `Corrige le fichier ${errorFile}, puis Forge relancera la synchronisation.` : 'Corrige la compilation ou la syntaxe Luau ; Forge réessaiera automatiquement.';
  else if (state === 'wrong-place') explanation = `Ouvre la place ${placeId} dans Roblox Studio avant de synchroniser.`;
  else if (state === 'waiting-studio') explanation = 'Ouvre Roblox Studio et vérifie que le plugin Forge est connecté.';
  else if (state === 'paused') explanation = placeId ? 'La synchronisation est en pause.' : 'Lie ce projet à une place Roblox pour synchroniser.';
  else if (state === 'error') explanation = 'La synchronisation a échoué. Consulte le détail, puis réessaie.';
  else if (state === 'synced') explanation = 'La dernière version a été confirmée dans Studio.';
  else if (state === 'compiling') explanation = project?.language === 'typescript' ? 'Forge compile le projet TypeScript complet.' : 'Forge valide la syntaxe Luau.';
  else if (state === 'syncing') explanation = 'Forge envoie et confirme le lot dans Studio.';
  else explanation = 'Forge prépare les fichiers locaux.';

  const action = state === 'compile-error' ? 'report'
    : state === 'waiting-studio' || state === 'wrong-place' ? 'reconnect'
    : state === 'paused' && !placeId ? 'link'
    : state === 'error' || (state === 'paused' && placeId) ? 'retry' : null;
  return {
    state, label: LABELS[state], explanation, action,
    language: project?.language === 'typescript' ? 'TypeScript' : 'Luau',
    sourceDirectory: project?.path ? path.join(project.path, 'src') : null,
    placeName: displayLink.placeName || (placeId ? `Place ${placeId}` : null),
    experienceId: displayLink.gameId ? String(displayLink.gameId) : null,
    expectedPlaceId: placeId,
    studioConnected: Boolean(studio.ready), studioCode,
    studioLabel: studio.ready ? 'Connecté à la bonne place' : state === 'wrong-place' ? 'Mauvaise place ouverte' : 'Déconnecté',
    validation: sync.phase === 'compile-error' ? 'failed' : sync.phase === 'compiling' ? 'running'
      : ['syncing', 'synced'].includes(sync.phase) ? 'valid' : 'unknown',
    validationLabel: sync.phase === 'compile-error' ? 'À corriger' : sync.phase === 'compiling' ? 'En cours'
      : ['syncing', 'synced'].includes(sync.phase) ? 'Valide' : 'Non vérifiée',
    pendingFiles: sync.pendingFiles || [], pendingCount: Number(sync.pending || 0),
    lastSyncedAt: sync.lastSyncedAt || null,
    error, errorFile,
    candidateBuildId: sync.candidateBuildId || null,
    lastValidBuildId: sync.lastValidBuildId || null,
  };
}

module.exports = { projectHealth, LABELS };
