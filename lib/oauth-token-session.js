function tokenExpiresAt(token) {
  const obtainedAt = Number(token?.obtained_at);
  const expiresIn = Number(token?.expires_in);
  if (!Number.isFinite(obtainedAt) || obtainedAt <= 0 || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return obtainedAt + expiresIn * 1000;
}

function shouldRefreshToken(token, now = Date.now(), skewMs = 60000) {
  const expiresAt = tokenExpiresAt(token);
  return Boolean(token?.refresh_token && expiresAt && expiresAt <= now + skewMs);
}

function mergeRotatedToken(previous, refreshed, now = Date.now()) {
  const next = { ...(previous || {}), ...(refreshed || {}), obtained_at: now };
  if (!next.refresh_token && previous?.refresh_token) next.refresh_token = previous.refresh_token;
  if (!next.scope && previous?.scope) next.scope = previous.scope;
  if (!next.requested_scope && previous?.requested_scope) next.requested_scope = previous.requested_scope;
  return next;
}

module.exports = { tokenExpiresAt, shouldRefreshToken, mergeRotatedToken };
