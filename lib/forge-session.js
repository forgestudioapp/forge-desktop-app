function hasIdentity(session) {
  return Boolean(session?.user?.id || session?.user?.email);
}

function hasUsableAccessToken(session, now = Date.now(), skewMs = 30000) {
  if (!session?.access_token || !hasIdentity(session)) return false;
  if (!session.expires_at) return true;
  return Number(session.expires_at) * 1000 > now + skewMs;
}

function canRestoreSession(session) {
  return Boolean(hasIdentity(session) && (session?.access_token || session?.refresh_token));
}

function mergeRefreshedSession(previous, refreshed, now = Date.now()) {
  const next = { ...(previous || {}), ...(refreshed || {}) };
  if (!next.refresh_token && previous?.refresh_token) next.refresh_token = previous.refresh_token;
  if (!next.user && previous?.user) next.user = previous.user;
  if (!next.expires_at && Number(next.expires_in) > 0) {
    next.expires_at = Math.floor(now / 1000) + Number(next.expires_in);
  }
  return next;
}

module.exports = { hasIdentity, hasUsableAccessToken, canRestoreSession, mergeRefreshedSession };
