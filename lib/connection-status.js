async function verifyRemoteSession(fetcher, url, options, service) {
  try {
    const response = await fetcher(url, options, 8000);
    if (response.ok) return { connected: true, state: 'valid' };
    if (response.status === 401 || response.status === 403) return { connected: false, state: 'expired' };
    return { connected: false, state: 'offline', error: `${service} HTTP ${response.status}` };
  } catch {
    return { connected: false, state: 'offline', error: `${service} est momentanément injoignable.` };
  }
}

module.exports = { verifyRemoteSession };
