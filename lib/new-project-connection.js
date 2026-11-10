(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ForgeNewProjectConnection = factory();
})(typeof window === 'object' ? window : globalThis, function() {
'use strict';

async function connectNewProject({ projectPath, approvedPlaceId = null, linkedPlaceId = null, getPlace, confirmPlace, link, sync, stage }) {
  stage('Connexion à Roblox Studio');
  const studio = await getPlace();
  if (studio?.error || !studio?.place?.placeId) return { status: 'waiting-studio', message: 'Ouvre dans Roblox Studio la place que tu veux utiliser. Forge la détectera automatiquement.' };
  const placeId = String(studio.place.placeId);
  if (linkedPlaceId && String(linkedPlaceId) !== placeId) return { status: 'wrong-place', error: `Mauvaise place ouverte : attendu ${linkedPlaceId}, reçu ${placeId}.` };
  if (!linkedPlaceId && approvedPlaceId !== placeId) {
    const accepted = await confirmPlace(studio.place);
    if (!accepted) return { status: 'declined', placeId };
  }
  if (!linkedPlaceId) {
    const linked = await link(projectPath, placeId);
    if (linked?.error) return { status: linked.code === 'place-changed' ? 'wrong-place' : 'error', error: linked.error };
  }
  stage('Synchronisation');
  const result = await sync(projectPath);
  if (result?.error) return { status: 'error', error: result.error, stage: result.firstSync?.stage || 'sync' };
  if (result?.firstSync?.status !== 'confirmed' || !result.firstSync.buildId) return { status: 'waiting-sync', error: result?.firstSync?.error || null };
  return { status: 'ready', placeId, buildId: result.firstSync.buildId };
}

return { connectNewProject };
});
