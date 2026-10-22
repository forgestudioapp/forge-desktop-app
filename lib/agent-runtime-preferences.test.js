'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAgentRuntimePreferences, applyAgentRuntimeEnvironment } = require('./agent-runtime-preferences');

test('Claude prompt suggestions are off by default and can be explicitly restored', () => {
  assert.deepEqual(normalizeAgentRuntimePreferences(null), { claudePromptSuggestions: false });
  assert.equal(normalizeAgentRuntimePreferences({ claudePromptSuggestions: 'true' }).claudePromptSuggestions, false);
  assert.equal(applyAgentRuntimeEnvironment('claude', { KEEP: 'yes' }, {}).CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION, 'false');
  assert.equal(applyAgentRuntimeEnvironment('claude', {}, { claudePromptSuggestions: true }).CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION, 'true');
  assert.deepEqual(applyAgentRuntimeEnvironment('codex', { KEEP: 'yes' }, {}), { KEEP: 'yes' });
});
