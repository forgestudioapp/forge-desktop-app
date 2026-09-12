const fs = require('fs');
const path = require('path');

// Suivi de consommation par tâche média.
// Stocké dans .forge-media/metrics.json à la racine du projet.
// Chaque entrée est indexed par job ID et contient :
//   - polls: nombre de requêtes de polling
//   - apiCalls: appels API externes (Tripo, Codex session, etc.)
//   - errors: erreurs rencontrées
//   - retries: tentatives de relance
//   - durationMs: durée totale (start → finish)
//   - downloadBytes: octets téléchargés
//   - consumption: consommation si renvoyée par le fournisseur

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
  fs.writeFileSync(metricsPath(projectPath), JSON.stringify(data, null, 2), 'utf8');
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
      if (extra.bytes) m.downloadBytes += extra.bytes;
      break;
    case 'done':
      m.durationMs = Date.now() - m.startedAt;
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
    durationMs: m.durationMs || (Date.now() - m.startedAt),
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
  const entries = Object.entries(metrics).slice(-limit);
  let totalPolls = 0, totalApiCalls = 0, totalErrors = 0, totalRetries = 0;
  let totalDuration = 0, completedJobs = 0, totalConsumption = null;
  const byMethod = {};
  for (const [jobId, m] of entries) {
    totalPolls += m.polls;
    totalApiCalls += m.apiCalls;
    totalErrors += m.errors;
    totalRetries += m.retries;
    if (m.status === 'done' || m.status === 'failed' || m.status === 'partial') {
      totalDuration += m.durationMs || 0;
      completedJobs++;
    }
    if (m.consumption) {
      if (!totalConsumption) totalConsumption = {};
      for (const [k, v] of Object.entries(m.consumption)) {
        totalConsumption[k] = (totalConsumption[k] || 0) + v;
      }
    }
    const method = m.method || 'unknown';
    if (!byMethod[method]) byMethod[method] = { jobs: 0, polls: 0, errors: 0, avgDuration: 0 };
    byMethod[method].jobs++;
    byMethod[method].polls += m.polls;
    byMethod[method].errors += m.errors;
    if (m.durationMs) byMethod[method].avgDuration += m.durationMs;
  }
  for (const m of Object.values(byMethod)) {
    if (m.jobs) m.avgDuration = Math.round(m.avgDuration / m.jobs);
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
