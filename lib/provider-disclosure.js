(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ForgeProviderDisclosure = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COPY = {
    fr: {
      codex: { provider: 'OpenAI Codex', source: 'Compte Codex connecté', cost: 'Utilise le quota de ton compte Codex. Aucun crédit média Forge séparé.' },
      tripo: { provider: 'Tripo3D', source: 'Service externe optionnel', cost: 'Consomme les crédits de ta clé Tripo3D. Le prix exact n’est pas disponible dans Forge.' },
      blender: { provider: 'Blender local', source: 'Exécuté sur cet ordinateur', cost: 'Aucun crédit fournisseur. Le rendu utilise les ressources de ton PC.' },
      roblox: { provider: 'Roblox', source: 'Compte Roblox connecté', cost: 'L’envoi dépend des règles et quotas Roblox affichés par Roblox.' },
    },
    en: {
      codex: { provider: 'OpenAI Codex', source: 'Connected Codex account', cost: 'Uses your Codex account quota. No separate Forge media credits.' },
      tripo: { provider: 'Tripo3D', source: 'Optional external service', cost: 'Uses credits from your Tripo3D key. The exact price is not available in Forge.' },
      blender: { provider: 'Local Blender', source: 'Runs on this computer', cost: 'No provider credits. Rendering uses your PC resources.' },
      roblox: { provider: 'Roblox', source: 'Connected Roblox account', cost: 'Uploads follow the rules and quotas displayed by Roblox.' },
    },
  };

  function describe(provider, language) {
    const lang = language === 'en' ? 'en' : 'fr';
    return COPY[lang][provider] || { provider: String(provider || 'Forge'), source: COPY[lang].codex.source, cost: lang === 'en' ? 'Cost information unavailable.' : 'Information de coût indisponible.' };
  }

  function sentence(provider, language) {
    const value = describe(provider, language);
    return `${value.provider} · ${value.source} · ${value.cost}`;
  }

  return { describe, sentence };
});
