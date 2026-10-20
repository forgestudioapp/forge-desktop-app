'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { describe, sentence } = require('./provider-disclosure');

test('explains provider, account and cost without inventing a price', () => {
  assert.match(sentence('codex', 'fr'), /quota de ton compte Codex/);
  assert.match(sentence('tripo', 'fr'), /prix exact n’est pas disponible/);
  assert.match(sentence('blender', 'fr'), /Aucun crédit fournisseur/);
  assert.doesNotMatch(JSON.stringify(describe('tripo', 'fr')), /\d+\s*(€|EUR|USD|crédits)/);
});

test('keeps an explicit fallback when cost data is unavailable', () => {
  assert.equal(describe('unknown', 'en').cost, 'Cost information unavailable.');
});
