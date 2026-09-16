'use strict';

function normalizeLicenseKey(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function createLicenseClient({ url, anonKey, request }) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };
  async function verify(key, { signup = false } = {}) {
    const normalized = normalizeLicenseKey(key);
    if (!normalized) return { valid: false, error: 'Entre la clé récupérée sur ta page d’achat itch.io.' };
    const rpc = signup ? 'verify_license_for_signup' : 'verify_license';
    const res = await request(`${url}/rest/v1/rpc/${rpc}`, {
      method: 'POST', headers, body: JSON.stringify({ key: normalized }),
    }, 15000);
    if (!res.ok) return { valid: false, error: 'La vérification des licences est indisponible. Réessaie dans un instant.' };
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return { valid: false, error: 'Clé introuvable. Copie la clé Forge depuis ta page d’achat itch.io.' };
    return {
      valid: row.valid === true, status: row.license_status, plan: row.license_plan,
      error: row.valid === true ? null : ['claimed', 'used'].includes(row.license_status)
        ? 'Cette clé est déjà associée à un compte. Choisis « Se connecter ».'
        : 'Cette clé est inactive ou expirée.',
    };
  }

  async function authenticate(mode, email, password, key) {
    if (!['signup', 'signin', 'recover'].includes(mode)) return { error: 'Action de connexion invalide.' };
    if (typeof email !== 'string' || !email.trim()) return { error: 'Entre ton adresse email.' };
    const payload = { email: email.trim() };
    if (mode !== 'recover') {
      if (typeof password !== 'string' || !password) return { error: 'Entre ton mot de passe.' };
      payload.password = password;
    }
    if (mode === 'signup') {
      const validation = await verify(key, { signup: true });
      if (!validation.valid) return { error: validation.error };
      payload.data = { forge_license_key: normalizeLicenseKey(key) };
    }
    const endpoint = mode === 'signup' ? 'signup' : mode === 'recover' ? 'recover' : 'token?grant_type=password';
    const res = await request(`${url}/auth/v1/${endpoint}`, {
      method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }, 15000);
    const data = await res.json();
    if (!res.ok) {
      return { error: data.code === 'unexpected_failure' || data.msg?.includes('Database error')
        ? 'L’inscription n’a pas abouti. Vérifie la clé, puis réessaie ou connecte-toi si tu as déjà créé ton compte.'
        : data.error_description || data.msg || data.message || 'Erreur de connexion.' };
    }
    if (mode === 'recover') return { success: true };
    const user = data.user || data;
    if (mode === 'signup' && Array.isArray(user.identities) && user.identities.length === 0) {
      return { error: 'Ce compte existe déjà. Choisis « Se connecter ».' };
    }
    if (!data.access_token || !data.user?.id) {
      if (mode === 'signup' && user.id) return { success: true, confirmationRequired: true };
      return { error: 'La connexion n’a pas renvoyé de session valide. Réessaie.' };
    }
    return { success: true, session: data };
  }
  return { verify, authenticate };
}

module.exports = { normalizeLicenseKey, createLicenseClient };
