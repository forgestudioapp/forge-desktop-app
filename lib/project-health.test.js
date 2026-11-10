'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { projectHealth, LABELS } = require('./project-health');

const project = { path: 'C:\\ForgeProjects\\Example', language: 'typescript', syncPaused: false,
  linkedStudio: { placeId: '123', gameId: '456', placeName: 'Atelier' } };
const synced = { phase: 'synced', pending: 0, pendingFiles: [], candidateBuildId: 'abc', lastValidBuildId: 'abc', lastSyncedAt: '2026-11-08T10:00:00.000Z' };
const connected = { ready: true, code: 'ready' };

test('une erreur de pont affiche une explication et Réessayer', () => {
  const state = projectHealth(project, { phase: 'error', error: 'Le pont Studio n’a pas pu vérifier la capacité de synchronisation.', pending: 2 }, connected);
  assert.equal(state.state, 'error');
  assert.equal(state.action, 'retry');
  assert.equal(state.pendingCount, 2);
  assert.match(state.error, /capacité de synchronisation/);
});

test('les neuf états demandés ont un libellé unique', () => {
  assert.deepEqual(Object.keys(LABELS).sort(), ['preparing','compiling','compile-error','waiting-studio','wrong-place','syncing','synced','paused','error'].sort());
});

test('Studio fermé affiche l’attente et la reconnexion sans effacer la dernière synchronisation', () => {
  const state = projectHealth(project, synced, { ready: false, code: 'studio-unavailable', error: 'Plugin absent' });
  assert.equal(state.state, 'waiting-studio');
  assert.equal(state.action, 'reconnect');
  assert.equal(state.lastSyncedAt, synced.lastSyncedAt);
  assert.equal(state.expectedPlaceId, '123');
  assert.equal(state.experienceId, '456');
});

test('la mauvaise place a priorité sur un état de compilation en cours', () => {
  const state = projectHealth(project, { phase: 'compiling', pending: 2 }, { ready: false, code: 'project-linked-elsewhere' });
  assert.equal(state.state, 'wrong-place');
  assert.match(state.explanation, /123/);
  assert.equal(state.action, 'reconnect');
});

test('une compilation échouée montre le fichier et ouvre le rapport', () => {
  const state = projectHealth(project, { phase: 'compile-error', error: 'TS2322: type incompatible', errorFile: 'src/main.server.ts', pending: 2 }, connected);
  assert.equal(state.state, 'compile-error');
  assert.equal(state.errorFile, 'src/main.server.ts');
  assert.equal(state.validationLabel, 'À corriger');
  assert.equal(state.action, 'report');
});

test('seule une version confirmée et sans fichier en attente est synchronisée', () => {
  const state = projectHealth(project, synced, connected);
  assert.equal(state.state, 'synced');
  assert.equal(state.action, null);
  assert.equal(state.language, 'TypeScript');
  assert.ok(state.sourceDirectory.endsWith(path.join('Example', 'src')));
  assert.equal(projectHealth(project, { ...synced, lastValidBuildId: null }, connected).state, 'preparing');
  assert.equal(projectHealth(project, { ...synced, pending: 1 }, connected).state, 'preparing');
});

test('pause, synchronisation et erreur utilisent les états du pipeline', () => {
  assert.equal(projectHealth({ ...project, syncPaused: true }, synced, connected).state, 'paused');
  assert.equal(projectHealth(project, { phase: 'syncing', pending: 2 }, connected).state, 'syncing');
  assert.equal(projectHealth(project, { phase: 'waiting-studio', error: 'Envoi refusé' }, connected).state, 'error');
});

test('le panneau affiche directement l’état central reçu, sans recalculer Studio et la compilation', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'workspace.html'), 'utf8');
  assert.match(html, /getProjectHealth\(activeProject\.path/);
  assert.doesNotMatch(html, /getFileSyncStatus\(activeProject\.path/);
  const start = html.indexOf('function healthText(');
  const end = html.indexOf('async function refreshProjectHealth(', start);
  const elements = new Map();
  const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, { textContent: '', hidden: false, title: '', className: '' }); return elements.get(id); } };
  const context = vm.createContext({ document, latestProjectHealth: null });
  vm.runInContext(html.slice(start, end), context);
  const state = projectHealth(project, { phase: 'compile-error', error: 'TS2322', errorFile: 'src/main.server.ts', pending: 2 }, connected);
  context.renderProjectHealth(state);
  assert.equal(document.getElementById('healthSummaryText').textContent, 'Une erreur doit être corrigée');
  assert.equal(document.getElementById('healthPending').textContent, '2');
  assert.match(document.getElementById('healthError').textContent, /main\.server\.ts.*TS2322/);
  assert.equal(document.getElementById('healthAction').textContent, 'Voir l’erreur');
});

test('l’IPC compose le même état de synchronisation et de Studio pour tout le panneau', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const start = main.indexOf("ipcMain.handle('get-project-health'");
  const end = main.indexOf("ipcMain.handle('retry-project-sync'", start);
  const handler = main.slice(start, end);
  assert.match(handler, /getFileSyncSnapshot\(projectPath\)/);
  assert.match(handler, /getProjectStudioStatus\(projectPath, force\)/);
  assert.match(handler, /projectHealth\(project, sync, studio\)/);
});
