'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { candidateBuildId, compileErrorFile, runCandidateSync } = require('./build-pipeline');
const { buildStudioBatchCode, buildStudioConfirmationCode, buildStudioValidationCode } = require('./file-sync');

const jobs = [
  { filename: 'ServerScriptService/a.server.luau', source: 'print("a")' },
  { filename: 'ReplicatedStorage/b.luau', source: 'return {}' },
];
function harness(overrides = {}) {
  const calls = [];
  const state = { marker: null };
  const deps = {
    jobs, buildId: candidateBuildId(jobs.map(job => [job.filename, job.source])), transactionId: 'a'.repeat(20),
    validate: async filename => { calls.push('validate:' + filename); return {}; },
    checkPlace: async () => { calls.push('place'); return { placeId: '123' }; },
    apply: async (_, placeId, buildId, txId) => { calls.push('apply:' + placeId); state.marker = buildId + ':' + txId; return {}; },
    confirm: async (buildId, _, txId) => { calls.push('confirm'); return state.marker === buildId + ':' + txId; },
    ...overrides,
  };
  return { calls, state, deps };
}

test('une erreur TypeScript bloque tout envoi et indique le fichier', async () => {
  const h = harness({ validate: async () => ({ error: 'src/main.server.ts(4,2): erreur', }), });
  const result = await runCandidateSync(h.deps);
  assert.equal(result.phase, 'compile-error');
  assert.equal(result.file, jobs[0].filename);
  assert.equal(compileErrorFile('src/main.server.ts(4,2): erreur'), 'src/main.server.ts');
  assert.deepEqual(h.calls, ['place']);
  assert.ok(!h.calls.some(call => call.startsWith('apply')));
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /if \(!result\.success\)[\s\S]*phase: 'compile-error'/);
  assert.match(main, /if \(typescriptBuildTimer \|\| typescriptBuildInProgress \|\| \['compile-error', 'error'\]\.includes\(fileSyncStatus\.phase\)\) return/);
});

test('une erreur Luau bloque un lot de plusieurs fichiers', async () => {
  const h = harness({ validate: async filename => filename === jobs[1].filename ? { error: 'syntax error' } : {} });
  const result = await runCandidateSync(h.deps);
  assert.deepEqual(result, { phase: 'compile-error', error: 'syntax error', file: jobs[1].filename });
  assert.deepEqual(h.calls, ['place']);
});

test('une coupure MCP pendant la validation reste une erreur de transport', async () => {
  const thrown = harness({ validate: async () => { throw Error('Connection closed'); } });
  assert.equal((await runCandidateSync(thrown.deps)).phase, 'waiting-studio');
  const returned = harness({ validate: async () => ({ error: 'Timeout SyncMCP', kind: 'transport' }) });
  assert.equal((await runCandidateSync(returned.deps)).phase, 'waiting-studio');
});

test('une mauvaise place arrête le lot avant toute modification', async () => {
  const h = harness({ checkPlace: async () => ({ error: 'PlaceId différent' }) });
  const result = await runCandidateSync(h.deps);
  assert.equal(result.phase, 'waiting-studio');
  assert.deepEqual(h.calls, []);
  const code = buildStudioBatchCode(jobs, '123', h.deps.buildId, h.deps.transactionId);
  assert.match(code, /game.PlaceId/);
  assert.match(buildStudioConfirmationCode('123'), /game.PlaceId/);
});

test('la correction relance le même lot et confirme une nouvelle version valide', async () => {
  let invalid = true;
  const h = harness({ validate: async () => invalid ? { error: 'syntax error' } : {} });
  assert.equal((await runCandidateSync(h.deps)).phase, 'compile-error');
  invalid = false;
  assert.equal((await runCandidateSync(h.deps)).phase, 'synced');
  assert.equal(h.state.marker, h.deps.buildId + ':' + h.deps.transactionId);
});

test('une interruption demande une confirmation avant de valider la version', async () => {
  const interrupted = harness({ apply: async () => { throw new Error('Connexion interrompue'); } });
  assert.equal((await runCandidateSync(interrupted.deps)).phase, 'waiting-studio');
  assert.equal(interrupted.state.marker, null);
  const completedButDisconnected = harness();
  completedButDisconnected.deps.apply = async (_, __, id, txId) => { completedButDisconnected.state.marker = id + ':' + txId; throw new Error('Réponse perdue'); };
  assert.equal((await runCandidateSync(completedButDisconnected.deps)).phase, 'synced');
  const stale = harness({ apply: async () => { throw new Error('Réponse perdue'); } });
  stale.state.marker = stale.deps.buildId + ':' + 'b'.repeat(20);
  assert.equal((await runCandidateSync(stale.deps)).phase, 'waiting-studio');
});

test('le lot prépare un retour arrière et ne confirme qu’après les écritures', () => {
  const code = buildStudioBatchCode(jobs, '123', candidateBuildId(jobs.map(job => [job.filename, job.source])), 'a'.repeat(20));
  assert.ok(code.indexOf('require(temporary)') < code.indexOf('local rollback = {}'));
  assert.doesNotMatch(code, /loadstring/);
  assert.match(buildStudioValidationCode(jobs[0].filename,jobs[0].source), /require\(temporary\)/);
  assert.ok(code.indexOf('editor:UpdateSourceAsync(target') < code.indexOf('game:SetAttribute("ForgeSyncBuildId"'));
  assert.match(code, /for _, undo in ipairs\(rollback\)/);
});

test('la reprise renvoie le projet TypeScript complet après validation', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /forceFullResync \? new Map\(\) : knownCompiledSignatures/);
  assert.match(main, /currentSyncLanguage = registered\.language === 'typescript'[\s\S]*forceFullResync = true/);
  assert.match(main, /saveConfirmedBuild\([\s\S]*forceFullResync = false/);
});
