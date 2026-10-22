#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'credit-benchmark-corpus.json'), 'utf8'));

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function validate(rows, expectedConfigurations = null) {
  const errors = [];
  if (!Array.isArray(rows) || !rows.length) return ['Campagne vide.'];
  const configurations = expectedConfigurations || [...new Set(rows.map(row => row.configuration).filter(Boolean))];
  if (!configurations.length) return ['Aucune configuration définie.'];
  const taskIds = new Set(corpus.map(task => task.id));
  for (const row of rows) {
    if (!configurations.includes(row.configuration)) errors.push(`Configuration inconnue : ${row.configuration || '(vide)'}`);
    if (!taskIds.has(row.taskId)) errors.push(`Tâche inconnue : ${row.taskId || '(vide)'}`);
  }
  for (const configuration of configurations) {
    for (const task of corpus) {
      const matching = rows.filter(row => row.configuration === configuration && row.taskId === task.id);
      if (matching.length !== 3) errors.push(`${configuration}/${task.id}: ${matching.length} répétition(s), 3 requises`);
      const repetitions = matching.map(row => Number(row.repetition)).sort((a, b) => a - b);
      if (matching.length === 3 && repetitions.join(',') !== '1,2,3') errors.push(`${configuration}/${task.id}: répétitions distinctes 1, 2 et 3 requises`);
    }
  }
  return [...new Set(errors)];
}

function summarize(rows) {
  const errors = validate(rows);
  rows.forEach(row => {
    if (!Number.isFinite(row.inputTokens) || !Number.isFinite(row.outputTokens)) errors.push(`${row.configuration}/${row.taskId}/${row.repetition}: tokens non mesurés`);
    if (!Number.isFinite(row.durationMs)) errors.push(`${row.configuration}/${row.taskId}/${row.repetition}: durée non mesurée`);
    if (typeof row.accepted !== 'boolean') errors.push(`${row.configuration}/${row.taskId}/${row.repetition}: résultat non évalué`);
  });
  if (errors.length) throw new Error(errors.join('\n'));
  return [...new Set(rows.map(row => row.configuration))].map(configuration => {
    const selected = rows.filter(row => row.configuration === configuration);
    const measured = selected.filter(row => Number.isFinite(row.inputTokens) && Number.isFinite(row.outputTokens));
    const tokenTotals = measured.map(row => row.inputTokens + row.outputTokens);
    return {
      configuration,
      runs: selected.length,
      accepted: selected.filter(row => row.accepted === true).length,
      failed: selected.filter(row => row.accepted === false).length,
      measuredRuns: measured.length,
      totalTokens: measured.length ? tokenTotals.reduce((sum, value) => sum + value, 0) : null,
      medianTokens: median(tokenTotals),
      cacheReadTokens: measured.length ? measured.reduce((sum, row) => sum + (row.cacheReadTokens || 0), 0) : null,
      medianDurationMs: median(selected.map(row => row.durationMs).filter(Number.isFinite)),
      retries: selected.reduce((sum, row) => sum + (Number(row.retries) || 0), 0),
      defects: selected.reduce((sum, row) => sum + (Number(row.defects) || 0), 0),
    };
  });
}

function template(configurations) {
  return configurations.flatMap(configuration => corpus.flatMap(task => [1, 2, 3].map(repetition => ({
    configuration, taskId: task.id, repetition, inputTokens: null, outputTokens: null,
    cacheReadTokens: null, durationMs: null, retries: 0, accepted: null, defects: 0,
  }))));
}

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    process.stdout.write(JSON.stringify({ corpus, template: template(['reference', 'optimized']) }, null, 2));
  } else {
    const report = { generatedAt: new Date().toISOString(), corpusVersion: 1, configurations: summarize(JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'))) };
    const json = JSON.stringify(report, null, 2);
    if (output) fs.writeFileSync(path.resolve(output), json); else process.stdout.write(json);
  }
}

module.exports = { corpus, template, validate, summarize, median };
