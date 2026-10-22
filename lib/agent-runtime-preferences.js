'use strict';

function normalizeAgentRuntimePreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    // Suggestions are an extra Claude request after the answer. Forge disables
    // them by default while leaving the conversation, model and tools intact.
    claudePromptSuggestions: input.claudePromptSuggestions === true,
  };
}

function applyAgentRuntimeEnvironment(agentType, env, preferences) {
  const output = { ...env };
  const safe = normalizeAgentRuntimePreferences(preferences);
  if (agentType === 'claude') {
    output.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION = safe.claudePromptSuggestions ? 'true' : 'false';
  }
  return output;
}

module.exports = { normalizeAgentRuntimePreferences, applyAgentRuntimeEnvironment };
