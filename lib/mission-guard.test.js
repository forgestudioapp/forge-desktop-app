'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMission, similarity, findDuplicateMission } = require('./mission-guard');

test('normalizes harmless formatting and detects an active duplicate', () => {
  assert.equal(normalizeMission('  Corrige le HUD !\n'), 'corrige le hud');
  const duplicate = findDuplicateMission({
    text: 'Corrige le HUD mobile et vérifie les boutons du magasin',
    agentId: 'b',
    live: [{ agentId: 'a', agentName: 'Codex #1', task: 'Corrige le HUD mobile, puis vérifie les boutons du magasin.' }],
  });
  assert.equal(duplicate.agentName, 'Codex #1');
  assert.ok(duplicate.similarity >= 0.86);
});

test('keeps distinct missions and ignores the same agent or completed work', () => {
  assert.ok(similarity('Construis le terrain volcanique', 'Répare les achats du magasin') < 0.86);
  assert.equal(findDuplicateMission({
    text: 'Corrige le HUD mobile et vérifie les boutons du magasin', agentId: 'a',
    live: [{ agentId: 'a', task: 'Corrige le HUD mobile et vérifie les boutons du magasin' }],
    persisted: [{ id: 'b', status: 'validated', task: 'Corrige le HUD mobile et vérifie les boutons du magasin' }],
  }), null);
});
