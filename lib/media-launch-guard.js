const fs = require('node:fs');
const { isActiveJob } = require('./media-jobs');

// The lock is acquired before the first asynchronous provider operation.
// Persisted jobs cover the period after launch and across app restarts.
function createMediaLaunchGuard(loadManifest) {
  const pending = new Set();
  return async function guard(options, launch) {
    const { projectPath, kind, itemId, variantId } = options;
    const root = fs.realpathSync(projectPath);
    const key = JSON.stringify([process.platform === 'win32' ? root.toLowerCase() : root, kind, itemId, variantId || null]);
    const busy = jobs => ({ error: 'Une génération est déjà en cours pour cet élément. Attends sa fin avant de relancer.', code: 'MEDIA_BUSY', jobIds: jobs.map(job => job.id) });
    if (pending.has(key)) return busy([]);
    pending.add(key);
    try {
      const manifest = loadManifest(root);
      const item = manifest.categories?.[kind]?.items?.find(entry => entry.id === itemId);
      const entry = variantId ? item?.variants?.find(variant => variant.id === variantId) : item;
      if (!entry) return { error: 'Élément de génération introuvable', code: 'MEDIA_NOT_FOUND' };
      const active = (manifest.jobs || []).filter(job => job.kind === kind && job.itemId === itemId &&
        (job.variantId || null) === (variantId || null) && isActiveJob(job));
      if (active.length) return busy(active);
      return await launch();
    } finally { pending.delete(key); }
  };
}

module.exports = { createMediaLaunchGuard };
