'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isLongMessage, compactMessage } = require('./agent-message-budget');

test('short messages stay identical and long messages become bounded local excerpts', () => {
  assert.equal(compactMessage('Court'), 'Court');
  const source = Array.from({ length: 900 }, (_, index) => index === 450 ? 'ERROR app.js:42 panne rare' : `ligne répétée ${index}`).join('\n');
  assert.equal(isLongMessage(source), true);
  const compact = compactMessage(source);
  assert.ok(compact.length <= 8000);
  assert.match(compact, /ERROR app\.js:42 panne rare/);
  assert.match(compact, /texte complet reste dans le brouillon/);
  assert.match(compact, /Fin de l’extrait/);
  const english = compactMessage(source, 8000, {
    header: '[Local excerpt: {chars} chars and {lines} lines]',
    omitted: '... {count} omitted ...',
    footer: '[End]',
  });
  assert.match(english, /^\[Local excerpt: \d+ chars and 900 lines\]/);
  assert.match(english, /omitted/);
  assert.match(english, /\[End\]$/);
});
