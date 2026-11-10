(function exposeQualityLabState(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ForgeQualityLabState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createQualityLabState() {
  function createGenerationGuard() {
    let generation = 0;
    return {
      begin() { generation += 1; return generation; },
      current() { return generation; },
      isCurrent(candidate) { return candidate === generation; },
    };
  }

  function guiAuditOutcome(data = {}) {
    const summary = data.summary || data;
    const issues = data.crossDeviceIssues || data.issues || [];
    const inspected = Number(summary.inspected ?? summary.totalDevices ?? summary.totalInspected ?? 0);
    const issueCount = Number(summary.issueCount ?? summary.totalIssues ?? issues.length);
    if (summary.incomplete) return 'incomplete';
    if (!(inspected > 0)) return 'empty';
    return issueCount === 0 ? 'clean' : 'issues';
  }

  async function waitForPlaytestStop({ stop, poll, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), maxAttempts = 8, intervalMs = 500 }) {
    const stopResult = await stop();
    if (!stopResult?.success) return stopResult;
    let lastData = stopResult.data || null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const result = await poll();
      if (!result?.success) {
        return {
          error: `Le signal d’arrêt a été envoyé, mais Forge n’a pas pu confirmer la fin du playtest : ${result?.error || 'réponse Studio invalide'}`,
          code: result?.code || 'playtest-stop-confirmation',
          data: lastData,
        };
      }
      lastData = result.data || lastData;
      if (result.data?.isRunning === false) return result;
      if (attempt < maxAttempts - 1) await sleep(intervalMs);
    }
    return {
      error: 'Le signal d’arrêt a été envoyé, mais le playtest est toujours actif après le délai de confirmation.',
      code: 'playtest-stop-timeout',
      data: lastData,
    };
  }

  return { createGenerationGuard, guiAuditOutcome, waitForPlaytestStop };
});
