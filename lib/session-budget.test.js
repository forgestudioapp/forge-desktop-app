'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { summarize, conflictCount } = require('./session-budget');

test('session budget reports active agents, startup load and a qualitative cost only', () => {
  const result = summarize({
    activeAgents: 1,
    openPanels: 2,
    startupAgents: { claude: 1, codex: 1, retired: 99 },
    maxAgents: 3,
  });
  assert.deepEqual(result, {
    activeAgents: 1,
    openPanels: 2,
    startupAgents: 2,
    maxAgents: 3,
    conflicts: 0,
    qualitativeCost: 'high',
    duplicateRisk: true,
    overLimit: false,
    preferLocalBlender: true,
    paidConfirmationRequired: true,
  });
  assert.equal(JSON.stringify(result).includes('€'), false);
});

test('resource conflicts are counted once and require a duplication warning', () => {
  const activities = [
    { id: 'a', conflicts: [{ agentId: 'b' }, { agentId: 'b' }] },
    { id: 'b', conflicts: [{ agentId: 'a' }] },
  ];
  assert.equal(conflictCount(activities), 1);
  const result = summarize({ activeAgents: 2, activities, preferLocalBlender: false });
  assert.equal(result.conflicts, 1);
  assert.equal(result.duplicateRisk, true);
  assert.equal(result.preferLocalBlender, false);
  assert.equal(result.paidConfirmationRequired, true);
});

test('empty or malformed values never invent active work or disable paid confirmation', () => {
  const result = summarize({ activeAgents: -4, startupAgents: { claude: 'bad' }, maxAgents: 0 });
  assert.equal(result.activeAgents, 0);
  assert.equal(result.startupAgents, 0);
  assert.equal(result.qualitativeCost, 'idle');
  assert.equal(result.duplicateRisk, false);
  assert.equal(result.maxAgents, 3);
  assert.equal(result.paidConfirmationRequired, true);
});

test('settings expose the live budget, local Blender preference and mandatory paid confirmation', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'settings.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'lib', 'settings.js'), 'utf8');
  const workspace = fs.readFileSync(path.join(root, 'workspace.html'), 'utf8');
  assert.ok(html.indexOf('lib/session-budget.js') < html.indexOf('lib/settings.js'));
  assert.match(html, /id="sessionBudgetSummary"/);
  assert.match(html, /Confirmation payante obligatoire/);
  assert.match(script, /listAgentSessions/);
  assert.match(script, /listAgentActivity/);
  assert.match(script, /preferLocalBlender/);
  assert.match(workspace, /confirm\('Convertir cette image avec Tripo[^']*crédits/);
});
