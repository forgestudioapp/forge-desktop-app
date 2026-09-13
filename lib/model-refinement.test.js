const test = require('node:test');
const assert = require('node:assert/strict');
const { correctionResult } = require('./model-refinement');
const response = result => ({ content: [{ text: JSON.stringify({ ok: true, result }) }] });
test('la correction lit le résultat imbriqué réellement renvoyé par Blender', () => {
  assert.equal(correctionResult(response({ applied: [{ type: 'move' }], errors: [] })).applied.length, 1);
});
test('erreur partielle et correction vide ne deviennent pas des réussites', () => {
  assert.throws(() => correctionResult(response({ applied: [{ type: 'move' }], errors: [{ type: 'rotate', error: 'denied' }] })), /denied/);
  assert.throws(() => correctionResult(response({ applied: [], errors: [] })), /Aucune/);
  assert.throws(() => correctionResult({ content: [{ text: '{"applied":[{}]}' }] }), /absent/);
});
