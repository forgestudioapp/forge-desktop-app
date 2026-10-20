'use strict';
(() => {
  const STORAGE_KEY = 'forge_consent_v1';
  const CONSENT_LIFETIME = 180 * 24 * 60 * 60 * 1000;
  const banner = document.querySelector('[data-consent-banner]');
  if (!banner) return;

  function readChoice() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!value || !['accepted', 'refused'].includes(value.choice)) return null;
      if (!Number.isFinite(value.at) || Date.now() - value.at > CONSENT_LIFETIME) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return value.choice;
    } catch (_) {
      return null;
    }
  }

  function loadAnalytics() {
    if (document.querySelector('script[data-forge-analytics]')) return;
    const script = document.createElement('script');
    script.src = 'analytics.js';
    script.defer = true;
    script.dataset.forgeAnalytics = 'true';
    document.head.appendChild(script);
  }

  function saveChoice(choice) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, at: Date.now() })); } catch (_) {}
    banner.hidden = true;
    if (choice === 'accepted') loadAnalytics();
    document.dispatchEvent(new CustomEvent('forge:consent', { detail: choice }));
  }

  banner.querySelector('[data-consent-accept]').addEventListener('click', () => saveChoice('accepted'));
  banner.querySelector('[data-consent-refuse]').addEventListener('click', () => saveChoice('refused'));
  document.querySelectorAll('[data-manage-consent]').forEach(button => button.addEventListener('click', () => {
    banner.hidden = false;
    banner.querySelector('[data-consent-refuse]').focus();
  }));

  const choice = readChoice();
  if (choice === 'accepted') loadAnalytics();
  else if (choice === null) banner.hidden = false;
})();
