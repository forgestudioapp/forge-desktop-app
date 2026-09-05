const ROBLOX_OAUTH_SCOPES = Object.freeze([
  'openid',
  'profile',
  'asset:read',
  'asset:write',
  'game-pass:read',
  'game-pass:write',
  'developer-product:read',
  'developer-product:write',
]);

function buildRobloxAuthorizationUrl({ clientId, redirectUri, codeChallenge, state, nonce }) {
  const url = new URL('https://apis.roblox.com/oauth/v1/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', ROBLOX_OAUTH_SCOPES.join(' '));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('prompt', 'consent select_account');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  return url.toString();
}

function parseRobloxOAuthCallback(requestUrl, redirectUri, expectedState) {
  const callback = new URL(requestUrl, redirectUri);
  const expected = new URL(redirectUri);
  if (callback.pathname !== expected.pathname) return { ignored: true };
  if (callback.searchParams.get('state') !== expectedState) {
    return { error: 'Réponse OAuth Roblox refusée : état de sécurité invalide.' };
  }
  const oauthError = callback.searchParams.get('error');
  if (oauthError) {
    const description = callback.searchParams.get('error_description');
    return { error: description || `Roblox a refusé la connexion (${oauthError}).` };
  }
  const code = callback.searchParams.get('code');
  if (!code) return { error: 'Aucun code reçu de Roblox.' };
  return { code };
}

function missingRobloxScopes(scopeValue) {
  const granted = new Set(String(scopeValue || '').split(/\s+/).filter(Boolean));
  return ROBLOX_OAUTH_SCOPES.filter(scope => !granted.has(scope));
}

module.exports = {
  ROBLOX_OAUTH_SCOPES,
  buildRobloxAuthorizationUrl,
  parseRobloxOAuthCallback,
  missingRobloxScopes,
};
