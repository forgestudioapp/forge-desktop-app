const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROBLOX_OAUTH_SCOPES,
  buildRobloxAuthorizationUrl,
  parseRobloxOAuthCallback,
  missingRobloxScopes,
  normalizeRobloxTokenData,
  missingRobloxTokenScopes,
} = require('./roblox-oauth');

test('construit une autorisation Roblox PKCE qui force le choix des ressources', () => {
  const authUrl = new URL(buildRobloxAuthorizationUrl({
    clientId: 'client',
    redirectUri: 'http://localhost:3000/oauth/callback',
    codeChallenge: 'challenge',
    state: 'state',
    nonce: 'nonce',
  }));

  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authUrl.searchParams.get('prompt'), 'consent select_account');
  assert.equal(authUrl.searchParams.get('state'), 'state');
  assert.equal(authUrl.searchParams.get('scope'), ROBLOX_OAUTH_SCOPES.join(' '));
});

test('refuse un callback Roblox dont le state ne correspond pas', () => {
  const result = parseRobloxOAuthCallback(
    '/oauth/callback?code=secret&state=wrong',
    'http://localhost:3000/oauth/callback',
    'expected'
  );
  assert.match(result.error, /état de sécurité invalide/);
  assert.equal(result.code, undefined);
});

test('valide le callback et détecte les permissions OAuth manquantes', () => {
  const result = parseRobloxOAuthCallback(
    '/oauth/callback?code=ok&state=expected',
    'http://localhost:3000/oauth/callback',
    'expected'
  );
  assert.equal(result.code, 'ok');
  assert.deepEqual(missingRobloxScopes(ROBLOX_OAUTH_SCOPES.join(' ')), []);
  assert.deepEqual(missingRobloxScopes('openid profile'), ROBLOX_OAUTH_SCOPES.slice(2));
});

test('normalise une réponse OAuth sans scope sans rejeter la connexion', () => {
  const token = normalizeRobloxTokenData({ access_token: 'token', refresh_token: 'refresh' });
  assert.equal(token.scope, ROBLOX_OAUTH_SCOPES.join(' '));
  assert.equal(token.requested_scope, ROBLOX_OAUTH_SCOPES.join(' '));
  assert.deepEqual(missingRobloxTokenScopes(token), []);
});

test('conserve les scopes partiels retournés par Roblox pour informer l’interface', () => {
  const token = normalizeRobloxTokenData({ access_token: 'token', scope: 'openid,profile' });
  assert.equal(token.scope, 'openid profile');
  assert.deepEqual(missingRobloxTokenScopes(token), ROBLOX_OAUTH_SCOPES.slice(2));
});

test('accepte les anciens jetons Forge sans métadonnée de scope', () => {
  assert.deepEqual(missingRobloxTokenScopes({ access_token: 'legacy' }), []);
});
