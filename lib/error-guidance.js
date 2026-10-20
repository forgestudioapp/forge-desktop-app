(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ForgeErrorGuidance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RULES = [
    { codes: ['project-unlinked'], text: /projet (?:local|non lié)|aucune place associée|link(?:ed)? (?:a )?place/i, href: 'project-settings.html', fr: 'Associer la place', en: 'Link the place' },
    { codes: ['project-linked-elsewhere', 'place-linked-elsewhere'], text: /autre place|déjà associée|wrong place|different place/i, href: 'project-settings.html', fr: 'Vérifier la place', en: 'Check the place' },
    { codes: ['place-unpublished'], text: /pas encore publiée|not (?:yet )?published/i, href: 'project-settings.html', fr: 'Voir la marche à suivre', en: 'See instructions' },
    { codes: ['studio-unavailable', 'plugin-missing'], text: /studio (?:fermé|indisponible|non ouvert)|plugin forge|plugin absent|studio unavailable|studio.*not open|missing plugin/i, href: 'onboarding.html', fr: 'Réparer Studio', en: 'Repair Studio' },
    { codes: ['agent-disconnected', 'agent-unavailable'], text: /agent (?:déconnecté|non actif)|claude.*déconnect|codex.*déconnect|agent.*disconnected/i, href: 'agents.html', fr: 'Reconnecter l’agent', en: 'Reconnect agent' },
    { codes: ['session-expired', 'auth-expired'], text: /session expirée|connexion expirée|session expired|sign in again/i, href: 'accounts.html', fr: 'Se reconnecter', en: 'Sign in again' },
    { codes: ['project-unknown'], text: /projet introuvable|dossier.*pas enregistré|project not found/i, href: 'projects.html', fr: 'Choisir un projet', en: 'Choose a project' },
    { codes: ['file-missing', 'ENOENT'], text: /fichier (?:manquant|introuvable)|file (?:missing|not found)|\bENOENT\b/i, href: 'workspace.html#files', fr: 'Ouvrir les fichiers', en: 'Open files' },
    { codes: ['quota-exceeded', 'rate-limit'], text: /quota|crédits? insuffisant|rate limit|too many requests/i, href: 'api-keys.html', fr: 'Vérifier le service', en: 'Check service' },
    { codes: ['network-error'], text: /réseau|network|fetch failed|hors ligne|offline/i, href: 'settings.html#diagnostics', fr: 'Ouvrir le diagnostic', en: 'Open diagnostics' },
    { codes: ['version-incompatible'], text: /version incompatible|mise à jour requise|update required|incompatible version/i, href: 'settings.html#diagnostics', fr: 'Vérifier la mise à jour', en: 'Check for updates' },
  ];

  function normalize(input) {
    if (typeof input === 'string') return { code: '', message: input };
    const value = input && typeof input === 'object' ? input : {};
    return {
      code: String(value.code || ''),
      message: String(value.error || value.message || ''),
    };
  }

  function guidanceFor(input, language) {
    const value = normalize(input);
    const rule = RULES.find(item => item.codes.includes(value.code) || item.text.test(value.message));
    if (!rule) return null;
    return {
      href: rule.href,
      label: language === 'en' ? rule.en : rule.fr,
      code: value.code || rule.codes[0],
    };
  }

  return { guidanceFor };
});
