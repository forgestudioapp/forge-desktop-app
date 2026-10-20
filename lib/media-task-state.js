(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ForgeMediaTaskState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ACTIVE = new Set(['draft', 'starting', 'pending', 'running', 'retry_wait', 'download_wait', 'downloading']);
  const COPY = {
    fr: {
      draft: 'Préparation locale', starting: 'Démarrage du fournisseur', pending: 'Attente du fournisseur',
      running: 'Génération en cours', retry_wait: 'Suivi bloqué · nouvelle tentative prévue',
      download_wait: 'Résultat distant prêt · téléchargement bloqué', downloading: 'Téléchargement du résultat',
      partial: 'Résultat partiel', failed: 'Échec', done: 'Terminé techniquement', validated: 'Résultat validé',
      cancelled: 'Processus local arrêté', tracking_stopped: 'Suivi local arrêté · tâche distante inconnue',
      elapsed: 'Écoulé', activity: 'Dernière activité', now: 'à l’instant',
    },
    en: {
      draft: 'Local preparation', starting: 'Starting provider', pending: 'Waiting for provider',
      running: 'Generation in progress', retry_wait: 'Tracking blocked · retry scheduled',
      download_wait: 'Remote result ready · download blocked', downloading: 'Downloading result',
      partial: 'Partial result', failed: 'Failed', done: 'Technically complete', validated: 'Validated result',
      cancelled: 'Local process stopped', tracking_stopped: 'Local tracking stopped · remote task unknown',
      elapsed: 'Elapsed', activity: 'Last activity', now: 'just now',
    },
  };

  function language(value) { return value === 'en' ? 'en' : 'fr'; }
  function provider(job) {
    if (job?.method === 'tripo') return 'Tripo';
    if (job?.method === 'blender') return 'Blender local';
    if (job?.method === 'codex') return 'Codex';
    return 'Forge';
  }
  function duration(ms) {
    const seconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60), rest = seconds % 60;
    if (minutes < 60) return `${minutes}m ${String(rest).padStart(2, '0')}s`;
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  }
  function age(timestamp, now, lang) {
    if (!timestamp) return '—';
    const seconds = Math.max(0, Math.floor((now - Number(timestamp)) / 1000));
    if (seconds < 5) return COPY[lang].now;
    return duration(seconds * 1000);
  }
  function describe(job, langValue, nowValue) {
    const lang = language(langValue), now = Number(nowValue || Date.now());
    const status = String(job?.status || 'draft');
    const startedAt = Number(job?.startedAt || job?.createdAt || now);
    const end = Number(job?.finishedAt || now);
    const lastActivityAt = Number(job?.lastActivityAt || job?.finishedAt || job?.startedAt || job?.createdAt || 0);
    return {
      status,
      active: ACTIVE.has(status),
      provider: provider(job),
      stage: COPY[lang][status] || status,
      elapsed: duration(Math.max(0, end - startedAt)),
      lastActivity: age(lastActivityAt, now, lang),
      elapsedLabel: COPY[lang].elapsed,
      activityLabel: COPY[lang].activity,
    };
  }
  function stopExplanation(job, langValue) {
    const lang = language(langValue);
    if (job?.method === 'codex') return lang === 'en'
      ? 'Stops the local Codex process. Existing files are kept.'
      : 'Arrête le processus Codex local. Les fichiers déjà créés sont conservés.';
    if (job?.method === 'tripo') return lang === 'en'
      ? 'Stops tracking in Forge only. The remote task may continue and still consume provider credits.'
      : 'Arrête uniquement le suivi dans Forge. La tâche distante peut continuer et consommer des crédits fournisseur.';
    return lang === 'en'
      ? 'This operation cannot be cancelled safely while it is running.'
      : 'Cette opération ne peut pas être annulée proprement pendant son exécution.';
  }
  return { describe, stopExplanation };
});
