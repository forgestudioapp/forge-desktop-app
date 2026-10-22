'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { corpus, template, validate, summarize } = require('../tools/credit-benchmark.cjs');

test('credit benchmark fixes twelve tasks and three repetitions per configuration', () => {
  assert.equal(corpus.length, 12);
  const rows = template(['reference', 'optimized']).map((row, index) => ({
    ...row, inputTokens: 100 + index, outputTokens: 20, cacheReadTokens: 10,
    durationMs: 1000, accepted: true,
  }));
  assert.equal(rows.length, 72);
  assert.deepEqual(validate(rows), []);
  const report = summarize(rows);
  assert.equal(report.length, 2);
  assert.equal(report[0].runs, 36);
  assert.equal(report[0].accepted, 36);
  assert.equal(report[0].measuredRuns, 36);
});

test('credit benchmark refuses partial evidence', () => {
  assert.throws(() => summarize(template(['reference']).slice(1)), /3 requises/);
});

test('credit benchmark refuses empty, unmeasured and duplicate repetitions', () => {
  assert.match(validate([]).join('\n'), /vide/);
  assert.throws(() => summarize(template(['reference'])), /tokens non mesurés/);
  const duplicate = template(['reference']).map(row => ({ ...row, repetition: 1 }));
  assert.match(validate(duplicate).join('\n'), /répétitions distinctes/);
});
