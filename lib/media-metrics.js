const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const nonnegative = value => Number.isFinite(value) && value >= 0 ? value : 0;
const counter = value => Math.min(Number.MAX_SAFE_INTEGER, Math.floor(nonnegative(value)));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const terminalStatus = status => ['done', 'failed', 'partial'].includes(status);
const finished = m => terminalStatus(m.status) && Number.isFinite(m.durationMs) && m.durationMs >= 0;

// Suivi de consommation par tâche média.
// Stocké dans .forge-media/metrics.json à la racine du projet.
// Chaque entrée est indexed par job ID et contient :
//   - polls: nombre de requêtes de polling
//   - apiCalls: appels API externes (Tripo, Codex session, etc.)
//   - errors: erreurs rencontrées
//   - retries: tentatives de relance
//   - durationMs: durée totale (start → finish)
//   - downloadBytes: octets téléchargés
//   - consumption: consommation réelle si renvoyée par le fournisseur
//     (ex: tripo_polls = nombre d'interrogations, PAS des crédits ;
//      codex_session = sessions IA + durée ; blender_local = fichiers produits)

function metricsPath(projectPath) {
  return path.join(projectPath, '.forge-media', 'metrics.json');
}

function readMetrics(projectPath) {
  let raw;
  try {
    raw = fs.readFileSync(metricsPath(projectPath), 'utf8');
  } catch (error) {
    // A locked or unreadable journal must not be mistaken for an empty one.
    if (error.code === 'ENOENT') return { data: {}, corrupt: false };
    throw error;
  }
  try {
    const data = JSON.parse(raw);
    if (!record(data)) return { data: {}, corrupt: true };
    if (Object.values(data).some(value => !record(value))) {
      return { data: Object.fromEntries(Object.entries(data).filter(([, value]) => record(value))), corrupt: true };
    }
    return { data, corrupt: false };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { data: {}, corrupt: true };
  }
}

function reportFailure(action, error) {
  console.warn(`[media-metrics] ${action}: ${error.code || error.message || error}`);
}

function loadMetrics(projectPath) {
  try {
    const state = readMetrics(projectPath);
    if (state.corrupt) reportFailure('Journal corrompu, lecture indisponible', new Error('INVALID_METRICS'));
    return state.data;
  } catch (error) {
    reportFailure('Lecture impossible, journal conservé', error);
    return {};
  }
}

function writeMetrics(projectPath, data, state) {
  const target = metricsPath(projectPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (state.corrupt) {
    const backup = target + '.' + randomUUID() + '.corrupt';
    // If preserving the original fails, leave it untouched and abandon metrics only.
    fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
    console.warn(`[media-metrics] Journal corrompu conservé dans ${backup}`);
  }
  const temporary = target + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, target);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) {
      if (error.code !== 'ENOENT') reportFailure('Nettoyage du fichier temporaire impossible', error);
    }
  }
}

function saveMetrics(projectPath, data) {
  try {
    if (!record(data) || Object.values(data).some(value => !record(value))) throw new Error('INVALID_METRICS');
    writeMetrics(projectPath, data, readMetrics(projectPath));
    return true;
  } catch (error) {
    reportFailure('Enregistrement impossible, tâche média inchangée', error);
    return false;
  }
}

function normalizeJob(value, now) {
  const m = record(value) ? value : {};
  return {
    ...m,
    polls: counter(m.polls), apiCalls: counter(m.apiCalls), errors: counter(m.errors), retries: counter(m.retries),
    durationMs: Number.isFinite(m.durationMs) && m.durationMs >= 0 ? m.durationMs : null,
    downloadBytes: nonnegative(m.downloadBytes),
    consumption: record(m.consumption) ? m.consumption : null,
    events: Array.isArray(m.events) ? m.events.slice(-100) : [],
    startedAt: Number.isFinite(m.startedAt) && m.startedAt >= 0 ? m.startedAt : now,
    method: typeof m.method === 'string' ? m.method : null,
    kind: typeof m.kind === 'string' ? m.kind : null,
    status: typeof m.status === 'string' ? m.status : undefined,
  };
}

// Enregistre une métrique pour un job donné.
// event : 'start' | 'poll' | 'api_call' | 'error' | 'retry' | 'download' | 'done' | 'consumption'
function trackEvent(projectPath, jobId, event, extra = {}) {
  if (!projectPath || typeof jobId !== 'string' || !jobId) return false;
  try {
    const state = readMetrics(projectPath);
    const metrics = state.data;
    const m = normalizeJob(Object.hasOwn(metrics, jobId) ? metrics[jobId] : null, Date.now());
    Object.defineProperty(metrics, jobId, { value: m, configurable: true, writable: true, enumerable: true });
    if (!record(extra)) extra = {};
    switch (event) {
    case 'start':
      m.startedAt = Date.now();
      m.durationMs = null;
      m.status = 'running';
      m.method = typeof extra.method === 'string' ? extra.method : null;
      m.kind = typeof extra.kind === 'string' ? extra.kind : null;
      break;
    case 'poll':
      m.polls = counter(m.polls + 1);
      break;
    case 'api_call':
      m.apiCalls = counter(m.apiCalls + 1);
      if (extra.endpoint) m.events.push({ t: Date.now(), type: 'api', endpoint: extra.endpoint });
      break;
    case 'error':
      m.errors = counter(m.errors + 1);
      if (extra.message) m.events.push({ t: Date.now(), type: 'error', msg: String(extra.message).slice(0, 200) });
      break;
    case 'retry':
      m.retries = counter(m.retries + 1);
      break;
    case 'download':
      m.downloadBytes = Math.min(Number.MAX_VALUE, m.downloadBytes + nonnegative(extra.bytes));
      break;
    case 'done':
      m.durationMs = m.durationMs ?? Math.max(0, Date.now() - m.startedAt);
      m.status = typeof extra.status === 'string' && extra.status ? extra.status : 'done';
      break;
    case 'consumption':
      m.consumption = record(extra.consumption) ? extra.consumption : null;
      break;
    }
    // Limite le nombre d'events stockés
    if (m.events.length > 100) m.events = m.events.slice(-100);
    writeMetrics(projectPath, metrics, state);
    return true;
  } catch (error) {
    // Metrics are ancillary: disk failures must never interrupt generation or import.
    reportFailure('Suivi indisponible, tâche média inchangée', error);
    return false;
  }
}

// Résumé pour un job spécifique
function getJobMetrics(projectPath, jobId) {
  const metrics = loadMetrics(projectPath);
  if (!Object.hasOwn(metrics, jobId)) return null;
  const m = normalizeJob(metrics[jobId], null);
  return {
    polls: m.polls,
    apiCalls: m.apiCalls,
    errors: m.errors,
    retries: m.retries,
    durationMs: m.durationMs ?? (m.startedAt === null || terminalStatus(m.status) ? null : Math.max(0, Date.now() - m.startedAt)),
    downloadBytes: m.downloadBytes,
    consumption: m.consumption,
    method: m.method,
    kind: m.kind,
    status: m.status || 'running',
  };
}

// Résumé agrégé pour tous les jobs récents
function getAggregatedMetrics(projectPath, limit = 50) {
  const metrics = loadMetrics(projectPath);
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 50;
  const entries = Object.entries(metrics).filter(([, m]) => record(m))
    .map(([id, m]) => [id, normalizeJob(m, null)])
    .sort((a, b) => nonnegative(b[1].startedAt) - nonnegative(a[1].startedAt)).slice(0, count);
  let totalPolls = 0, totalApiCalls = 0, totalErrors = 0, totalRetries = 0;
  let totalDuration = 0, completedJobs = 0, totalConsumption = null;
  const byMethod = {};
  for (const [jobId, m] of entries) {
    totalPolls += nonnegative(m.polls);
    totalApiCalls += nonnegative(m.apiCalls);
    totalErrors += nonnegative(m.errors);
    totalRetries += nonnegative(m.retries);
    if (finished(m)) {
      totalDuration += m.durationMs;
      completedJobs++;
    }
    if (m.consumption) {
      for (const [k, v] of Object.entries(m.consumption)) {
        if (!Number.isFinite(v) || v < 0 || ['__proto__', 'constructor', 'prototype'].includes(k)) continue;
        if (!totalConsumption) totalConsumption = {};
        totalConsumption[k] = (totalConsumption[k] || 0) + v;
      }
    }
    const method = m.method || 'unknown';
    if (!Object.hasOwn(byMethod, method)) Object.defineProperty(byMethod, method, { value: { jobs: 0, completedJobs: 0, polls: 0, errors: 0, avgDuration: 0 }, enumerable: true });
    byMethod[method].jobs++;
    byMethod[method].polls += nonnegative(m.polls);
    byMethod[method].errors += nonnegative(m.errors);
    if (finished(m)) { byMethod[method].avgDuration += m.durationMs; byMethod[method].completedJobs++; }
  }
  for (const m of Object.values(byMethod)) {
    if (m.completedJobs) m.avgDuration = Math.round(m.avgDuration / m.completedJobs);
  }
  return {
    totalJobs: entries.length,
    totalPolls,
    totalApiCalls,
    totalErrors,
    totalRetries,
    avgDurationMs: completedJobs ? Math.round(totalDuration / completedJobs) : 0,
    totalConsumption,
    byMethod,
  };
}

module.exports = { trackEvent, getJobMetrics, getAggregatedMetrics, loadMetrics, saveMetrics };
