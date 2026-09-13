const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const nonnegative = value => Number.isFinite(value) && value >= 0 ? value : 0;
const finished = m => ['done', 'failed', 'partial'].includes(m.status) && Number.isFinite(m.durationMs) && m.durationMs >= 0;

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

function loadMetrics(projectPath) {
  const p = metricsPath(projectPath);
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {}
  return {};
}

function saveMetrics(projectPath, data) {
  const dir = path.dirname(metricsPath(projectPath));
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  const target = metricsPath(projectPath);
  const temporary = target + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

// Enregistre une métrique pour un job donné.
// event : 'start' | 'poll' | 'api_call' | 'error' | 'retry' | 'download' | 'done' | 'consumption'
function trackEvent(projectPath, jobId, event, extra = {}) {
  if (!projectPath || !jobId) return;
  const metrics = loadMetrics(projectPath);
  if (!metrics[jobId]) {
    metrics[jobId] = {
      polls: 0, apiCalls: 0, errors: 0, retries: 0,
      durationMs: null, downloadBytes: 0,
      consumption: null, events: [],
      startedAt: Date.now(),
    };
  }
  const m = metrics[jobId];
  switch (event) {
    case 'start':
      m.startedAt = Date.now();
      m.durationMs = null;
      m.status = 'running';
      m.method = extra.method || null;
      m.kind = extra.kind || null;
      break;
    case 'poll':
      m.polls++;
      break;
    case 'api_call':
      m.apiCalls++;
      if (extra.endpoint) m.events.push({ t: Date.now(), type: 'api', endpoint: extra.endpoint });
      break;
    case 'error':
      m.errors++;
      if (extra.message) m.events.push({ t: Date.now(), type: 'error', msg: extra.message.slice(0, 200) });
      break;
    case 'retry':
      m.retries++;
      break;
    case 'download':
      m.downloadBytes += nonnegative(extra.bytes);
      break;
    case 'done':
      m.durationMs = m.durationMs ?? Math.max(0, Date.now() - m.startedAt);
      m.status = extra.status || 'done';
      break;
    case 'consumption':
      m.consumption = extra.consumption || null;
      break;
  }
  // Limite le nombre d'events stockés
  if (m.events.length > 100) m.events = m.events.slice(-100);
  saveMetrics(projectPath, metrics);
}

// Résumé pour un job spécifique
function getJobMetrics(projectPath, jobId) {
  const metrics = loadMetrics(projectPath);
  const m = metrics[jobId];
  if (!m) return null;
  return {
    polls: m.polls,
    apiCalls: m.apiCalls,
    errors: m.errors,
    retries: m.retries,
    durationMs: m.durationMs ?? Math.max(0, Date.now() - m.startedAt),
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
  const entries = Object.entries(metrics).filter(([, m]) => m && typeof m === 'object')
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
