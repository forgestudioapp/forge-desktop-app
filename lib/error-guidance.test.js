'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { guidanceFor } = require('./error-guidance');

test('les erreurs fréquentes proposent une action précise', () => {
  assert.deepEqual(guidanceFor({ code: 'project-unlinked' }, 'fr'), {
    href: 'project-settings.html', label: 'Associer la place', code: 'project-unlinked',
  });
  assert.equal(guidanceFor('Studio indisponible : vérifie le plugin Forge', 'fr').href, 'onboarding.html');
  assert.equal(guidanceFor('Session expired', 'en').label, 'Sign in again');
  assert.equal(guidanceFor('Quota dépassé', 'fr').href, 'api-keys.html');
  assert.equal(guidanceFor({ code: 'plugin-missing' }, 'fr').href, 'onboarding.html');
  assert.equal(guidanceFor('Fichier introuvable', 'fr').href, 'workspace.html#files');
});

test('un message inconnu ne reçoit pas une action inventée', () => {
  assert.equal(guidanceFor('Une erreur totalement inconnue', 'fr'), null);
  assert.equal(guidanceFor(null, 'fr'), null);
});
