const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGenerationGuard, guiAuditOutcome, waitForPlaytestStop } = require('./quality-lab-state');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Quality Lab is wired through the renderer, preload and protected Studio handlers', () => {
  const main = read('main.js');
  const preload = read('preload.js');
  const workspace = read('workspace.html');

  for (const channel of [
    'quality-lab-gui',
    'quality-lab-playtest-start',
    'quality-lab-playtest-output',
    'quality-lab-playtest-stop',
  ]) {
    assert.match(main, new RegExp(`ipcMain\\.handle\\('${channel}'`));
    assert.match(preload, new RegExp(`ipcRenderer\\.invoke\\('${channel}'`));
  }

  assert.match(main, /ensureProjectPlaceAssociation\(projectPath\)/);
  assert.match(main, /\['play', 'run', 'multiplayer'\]/);
  assert.match(workspace, /id="qualityLabOverlay"/);
  assert.match(workspace, /runQualityGuiAudit\(true\)/);
  assert.match(workspace, /startQualityPlaytest\('multiplayer'\)/);
  assert.doesNotMatch(workspace, /Rapport de validation affiché dans la console/);
});

test('stopping a playtest polls until Studio confirms the final non-running state', async () => {
  const main = read('main.js');
  const stopHandler = main.match(/ipcMain\.handle\('quality-lab-playtest-stop'[\s\S]*?\n\}\);/);
  const replies = [true, true, false];
  const sleeps = [];
  const result = await waitForPlaytestStop({
    stop: async () => ({ success: true, data: { message: 'signal sent' } }),
    poll: async () => ({ success: true, data: { isRunning: replies.shift(), output: ['log'] } }),
    sleep: async delay => sleeps.push(delay),
    maxAttempts: 5,
    intervalMs: 25,
  });

  assert.ok(stopHandler, 'quality-lab-playtest-stop handler should exist');
  assert.equal(result.success, true);
  assert.equal(result.data.isRunning, false);
  assert.deepEqual(sleeps, [25, 25]);
  assert.match(stopHandler[0], /qualityLabActiveRuns\.delete\(canonicalProjectPath\(projectPath\)\)/);
  assert.match(stopHandler[0], /result\.success && result\.data\?\.isRunning === false/);
  assert.match(read('workspace.html'), /'TERMINÉ SANS ASSERTION':'Logs reçus, aucun verdict explicite'/);
});

test('a playtest stop times out explicitly and never invents a stopped result', async () => {
  let polls = 0;
  const result = await waitForPlaytestStop({
    stop: async () => ({ success: true, data: { message: 'signal sent' } }),
    poll: async () => { polls += 1; return { success: true, data: { isRunning: true } }; },
    sleep: async () => {},
    maxAttempts: 3,
  });

  assert.equal(polls, 3);
  assert.equal(result.code, 'playtest-stop-timeout');
  assert.equal(result.data.isRunning, true);
  assert.match(result.error, /toujours actif/);
});

test('an old refresh generation is stale as soon as stop begins', () => {
  const guard = createGenerationGuard();
  const refreshGeneration = guard.begin();
  assert.equal(guard.isCurrent(refreshGeneration), true);
  const stopGeneration = guard.begin();
  assert.equal(guard.isCurrent(refreshGeneration), false);
  assert.equal(guard.isCurrent(stopGeneration), true);
});

test('GUI audit reports clean only when at least one element was inspected', () => {
  const workspace = read('workspace.html');
  const i18n = read('lib/i18n.js');

  assert.equal(guiAuditOutcome({ summary: { inspected: 4, issueCount: 0 } }), 'clean');
  assert.equal(guiAuditOutcome({ summary: { inspected: 0, issueCount: 0 } }), 'empty');
  assert.equal(guiAuditOutcome({ summary: { totalDevices: 0 }, issues: [] }), 'empty');
  assert.equal(guiAuditOutcome({ summary: { inspected: 4, issueCount: 1 } }), 'issues');
  assert.equal(guiAuditOutcome({ summary: { inspected: 4, issueCount: 0, incomplete: true } }), 'incomplete');
  assert.match(workspace, /outcome==='empty'\?t\('quality_lab_gui_empty'\)/);
  assert.match(workspace, /emptyMessage\|\|t\('quality_lab_no_issue'\)/);
  assert.match(i18n, /quality_lab_gui_clean:\s*'Analyse terminée : aucun problème détecté\.'/);
  assert.match(i18n, /quality_lab_gui_empty:\s*'Analyse terminée, mais aucun élément n’a été inspecté\.'/);
  assert.match(i18n, /quality_lab_gui_clean:\s*'Analysis complete: no issues detected\.'/);
});
