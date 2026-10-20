'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { describe, stopExplanation } = require('./media-task-state');

test('décrit les étapes réelles sans pourcentage inventé', () => {
  const value = describe({ method: 'tripo', status: 'download_wait', startedAt: 1_000, lastActivityAt: 31_000 }, 'fr', 61_000);
  assert.equal(value.stage, 'Résultat distant prêt · téléchargement bloqué');
  assert.equal(value.provider, 'Tripo');
  assert.equal(value.elapsed, '1m 00s');
  assert.equal(value.lastActivity, '30s');
  assert.doesNotMatch(JSON.stringify(value), /%/);
});

test('distingue arrêt du processus et arrêt du suivi', () => {
  assert.match(stopExplanation({ method: 'codex' }, 'fr'), /processus Codex local/);
  assert.match(stopExplanation({ method: 'tripo' }, 'fr'), /uniquement le suivi/);
  assert.match(describe({ status: 'cancelled' }, 'fr').stage, /Processus local arrêté/);
  assert.match(describe({ status: 'tracking_stopped' }, 'fr').stage, /tâche distante inconnue/);
});
