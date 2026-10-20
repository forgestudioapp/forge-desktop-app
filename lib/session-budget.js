(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ForgeSessionBudget = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function safeCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function plannedAgents(startupAgents) {
    const value = startupAgents && typeof startupAgents === 'object' ? startupAgents : {};
    return safeCount(value.claude) + safeCount(value.codex);
  }

  function conflictCount(activities) {
    const pairs = new Set();
    for (const agent of Array.isArray(activities) ? activities : []) {
      for (const conflict of Array.isArray(agent?.conflicts) ? agent.conflicts : []) {
        const ids = [String(agent?.id || ''), String(conflict?.agentId || '')].filter(Boolean).sort();
        if (ids.length === 2) pairs.add(ids.join('\u0000'));
      }
    }
    return pairs.size;
  }

  function qualitativeLevel(agentCount) {
    if (agentCount <= 0) return 'idle';
    if (agentCount === 1) return 'moderate';
    if (agentCount === 2) return 'high';
    return 'very_high';
  }

  function summarize(input = {}) {
    const activeAgents = safeCount(input.activeAgents);
    const openPanels = safeCount(input.openPanels);
    const startup = plannedAgents(input.startupAgents);
    const maxAgents = Math.max(1, safeCount(input.maxAgents) || 3);
    const conflicts = conflictCount(input.activities);
    const costAgents = Math.max(activeAgents, startup);
    return {
      activeAgents,
      openPanels,
      startupAgents: startup,
      maxAgents,
      conflicts,
      qualitativeCost: qualitativeLevel(costAgents),
      duplicateRisk: conflicts > 0 || costAgents > 1,
      overLimit: startup > maxAgents,
      preferLocalBlender: input.preferLocalBlender !== false,
      paidConfirmationRequired: true,
    };
  }

  return { summarize, plannedAgents, conflictCount, qualitativeLevel };
});
