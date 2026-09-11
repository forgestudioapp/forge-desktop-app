const TERMINAL = new Set(['done', 'failed', 'partial', 'cancelled']);
function isActiveJob(job) { return !TERMINAL.has(job.status); }
function retainJobs(jobs, historyLimit = 50) {
  const history = jobs.filter(job => !isActiveJob(job)).slice(-historyLimit);
  const retained = new Set(history);
  return jobs.filter(job => isActiveJob(job) || retained.has(job));
}
function resultUrl(kind, output = {}) {
  const candidates = kind === 'img2model'
    ? [output.fbx_model, output.pbr_model, output.model, output.base_model, output.model_url]
    : [output.rendered_image, output.image_url, output.images, output.result_image];
  for (const item of candidates.flat()) {
    const url = typeof item === 'string' ? item : item?.url;
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url;
  }
  return null;
}

// This worker deliberately has no create-task dependency: retries cannot generate again.
async function advanceRemoteJob(previous, { poll, download, now = Date.now }) {
  const job = { ...previous };
  if (!isActiveJob(job) || (job.nextAttemptAt || 0) > now()) return job;
  try {
    const data = await poll(job.id);
    if (!data || typeof data.status !== 'string') throw new Error('Statut distant invalide');
    if (data.status === 'failed' || data.status === 'cancelled') {
      return { ...job, status: 'failed', error: data.error_msg || 'La tâche distante a échoué.', finishedAt: now(), nextAttemptAt: null };
    }
    if (data.status !== 'success') {
      return { ...job, status: 'running', remoteStatus: data.status, error: null, retryCount: 0, nextAttemptAt: now() + 5000 };
    }
    job.remoteStatus = 'success';
    job.status = 'downloading';
    const url = resultUrl(job.kind, data.output);
    if (!url) throw new Error('Génération terminée, fichier de sortie encore indisponible.');
    const saved = await download(url, job, data);
    if (!saved) throw new Error('Génération terminée, téléchargement non abouti.');
    return { ...job, saved, status: 'done', error: null, retryCount: 0, nextAttemptAt: null, finishedAt: now() };
  } catch (err) {
    const retryCount = (job.retryCount || 0) + 1;
    return { ...job, status: job.remoteStatus === 'success' ? 'download_wait' : 'retry_wait',
      error: err.message, retryCount, finishedAt: null,
      nextAttemptAt: now() + Math.min(60000, 5000 * 2 ** Math.min(retryCount - 1, 4)) };
  }
}

// Polling must not resurrect deleted jobs, drop newly-created jobs, or overwrite renamed items.
function mergePolledJobs(latest, processed, findEntry) {
  for (const job of processed) {
    const live = (latest.jobs || []).find(item => item.id === job.id);
    if (!live || !isActiveJob(live)) continue;
    Object.assign(live, job);
    const entry = findEntry?.(latest, job.kind, job.itemId, job.variantId);
    if (entry) {
      const related = latest.jobs.filter(item => item.kind === job.kind && item.itemId === job.itemId && item.variantId === job.variantId);
      const files = [...new Set([...(entry.files || []), ...related.flatMap(item => item.saved ? [item.saved] : item.files || [])])];
      const active = related.find(isActiveJob);
      entry.files = files;
      entry.status = active ? active.status : related.every(item => item.status === 'done') ? 'done' : files.length ? 'partial' : 'failed';
      entry.error = related.find(item => item.error)?.error || null;
      if (!active) entry.finishedAt = Math.max(...related.map(item => item.finishedAt || 0));
    }
  }
  latest.jobs = retainJobs(latest.jobs || []);
  return latest;
}
module.exports = { isActiveJob, retainJobs, resultUrl, advanceRemoteJob, mergePolledJobs };
