const ROBLOX_OAUTH_SCOPES = Object.freeze([
  'openid',
  'profile',
  'asset:read',
  'asset:write',
  'game-pass:read',
  'game-pass:write',
]);

const ROBLOX_SCOPE_OPERATIONS = new Set([
  'create',
  'delete',
  'manage',
  'manage-and-spend-robux',
  'publish',
  'read',
  'update',
  'write',
]);

function canonicalizeRobloxScopes(scopeValue) {
  const rawScopes = Array.isArray(scopeValue)
    ? scopeValue
    : String(scopeValue || '').split(/[\s,]+/);
  const canonical = [];
  let currentScopeType = null;

  for (const rawScope of rawScopes) {
    const scope = String(rawScope).trim();
    if (!scope) continue;
    const separator = scope.lastIndexOf(':');
    if (separator > 0) {
      currentScopeType = scope.slice(0, separator);
      canonical.push(scope);
    } else if (currentScopeType && ROBLOX_SCOPE_OPERATIONS.has(scope)) {
      // Roblox can compact operations that share a target, for example:
      // "asset:read write game-pass:read write".
      canonical.push(`${currentScopeType}:${scope}`);
    } else {
      currentScopeType = null;
      canonical.push(scope);
    }
  }

  return [...new Set(canonical)];
}

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
  const granted = new Set(canonicalizeRobloxScopes(scopeValue));
  return ROBLOX_OAUTH_SCOPES.filter(scope => !granted.has(scope));
}

function normalizeRobloxTokenData(tokenData) {
  const data = tokenData && typeof tokenData === 'object' ? tokenData : {};
  // Some OAuth servers omit `scope` when the granted set is identical to the
  // requested set. Persist the request in that case so Forge does not turn a
  // successful login into a false "permissions missing" error.
  const returnedScopes = canonicalizeRobloxScopes(data.scope);
  const effectiveScopes = returnedScopes.length ? returnedScopes : ROBLOX_OAUTH_SCOPES;
  return {
    ...data,
    scope: effectiveScopes.join(' '),
    requested_scope: ROBLOX_OAUTH_SCOPES.join(' '),
  };
}

function missingRobloxTokenScopes(tokenData) {
  const data = tokenData && typeof tokenData === 'object' ? tokenData : {};
  const scopeValue = data.scope || data.requested_scope;
  // Tokens created by older Forge versions requested the same capabilities but
  // did not persist request metadata. Do not invalidate those local sessions.
  return scopeValue ? missingRobloxScopes(scopeValue) : [];
}

module.exports = {
  ROBLOX_OAUTH_SCOPES,
  buildRobloxAuthorizationUrl,
  parseRobloxOAuthCallback,
  canonicalizeRobloxScopes,
  missingRobloxScopes,
  normalizeRobloxTokenData,
  missingRobloxTokenScopes,
};
