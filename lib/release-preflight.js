(function exposeReleasePreflight(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ForgeReleasePreflight = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createReleasePreflight() {
  function checkEvidence(evidence, projectPath, buildId) {
    return Boolean(evidence && evidence.projectPath === projectPath && buildId
      && evidence.buildId === buildId && evidence.validBuild === true);
  }

  function evaluateReleasePreflight(health, projectPath, evidence = {}) {
    const buildId = health?.lastValidBuildId || null;
    const linked = Boolean(health?.expectedPlaceId);
    const connected = linked && health?.studioConnected === true && health?.studioCode === 'ready';
    const synced = connected && health?.state === 'synced' && Number(health?.pendingCount) === 0
      && buildId && health?.candidateBuildId === buildId;
    const guiCurrent = checkEvidence(evidence.gui, projectPath, buildId);
    const playtestCurrent = checkEvidence(evidence.playtest, projectPath, buildId);
    const checks = [
      { id: 'place', status: !linked ? 'blocked' : connected ? 'passed' : 'blocked' },
      { id: 'sync', status: !linked || health?.state === 'compile-error' || health?.state === 'error'
        ? 'blocked' : synced ? 'passed' : 'unverified' },
      { id: 'gui', status: !guiCurrent ? 'unverified'
        : evidence.gui.outcome === 'clean' && evidence.gui.multiDevice === true ? 'passed'
          : evidence.gui.outcome === 'issues' ? 'blocked' : 'unverified' },
      { id: 'playtest', status: !playtestCurrent ? 'unverified'
        : ['FAIL', 'FAILED', 'FAILURE', 'FALSE', 'ERROR'].includes(evidence.playtest.verdict)
          || evidence.playtest.hasError === true ? 'blocked'
          : evidence.playtest.completed === true
            && ['PASS', 'PASSED', 'SUCCESS', 'TRUE'].includes(evidence.playtest.verdict) ? 'passed' : 'unverified' },
    ];
    return {
      status: checks.every(check => check.status === 'passed') ? 'ready'
        : checks.some(check => check.status === 'blocked') ? 'blocked' : 'unverified',
      checks,
      placeId: health?.expectedPlaceId || null,
      buildId,
      checkedAt: new Date().toISOString(),
    };
  }

  return { evaluateReleasePreflight };
});
