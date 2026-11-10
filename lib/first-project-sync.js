'use strict';
async function waitForFirstProjectSync(getStatus, { timeoutMs = 20000, intervalMs = 250, now = Date.now, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const deadline = now() + timeoutMs;
  do {
    const status = await getStatus();
    if (status?.phase === 'synced') return { status: 'confirmed', buildId: status.lastValidBuildId || null, at: status.lastSyncedAt || null };
    if (status?.phase === 'compile-error') return { status: 'error', stage: 'validation', error: status.error || 'Validation du code impossible.', file: status.errorFile || null };
    if (status?.phase === 'error') return { status: 'error', stage: 'sync', error: status.error || 'Synchronisation impossible.', file: status.errorFile || null };
    if (status?.phase === 'wrong-place') return { status: 'error', stage: 'place', error: status.error || 'Mauvaise place ouverte.' };
    if (now() >= deadline) return { status: 'waiting-studio', error: status?.error || 'Confirmation Studio en attente.' };
    await delay(intervalMs);
  } while (true);
}
module.exports = { waitForFirstProjectSync };
