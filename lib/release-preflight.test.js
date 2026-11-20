'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateReleasePreflight } = require('./release-preflight');

const projectPath = 'C:/ForgeProjects/my-game';
const health = {
  state: 'synced', studioConnected: true, studioCode: 'ready', expectedPlaceId: '123',
  pendingCount: 0, candidateBuildId: 'build-2', lastValidBuildId: 'build-2',
};
const evidence = {
  gui: { projectPath, buildId: 'build-2', validBuild: true, multiDevice: true, outcome: 'clean' },
  playtest: { projectPath, buildId: 'build-2', validBuild: true, verdict: 'SUCCESS', completed: true, hasError: false },
};

test('publication readiness requires synced build and both current checks', () => {
  const result = evaluateReleasePreflight(health, projectPath, evidence);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.checks.map(check => check.status), ['passed', 'passed', 'passed', 'passed']);
});

test('a new build makes previous GUI and playtest evidence stale', () => {
  const result = evaluateReleasePreflight({ ...health, candidateBuildId: 'build-3', lastValidBuildId: 'build-3' }, projectPath, evidence);
  assert.equal(result.status, 'unverified');
  assert.deepEqual(result.checks.map(check => check.status), ['passed', 'passed', 'unverified', 'unverified']);
});

test('a disconnected or wrong place blocks readiness', () => {
  const result = evaluateReleasePreflight({ ...health, studioConnected: false, studioCode: 'place-linked-elsewhere', state: 'wrong-place' }, projectPath, evidence);
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks[0].status, 'blocked');
});

test('an inconclusive or unfinished playtest never proves a completed check', () => {
  const result = evaluateReleasePreflight(health, projectPath, { ...evidence, playtest: { ...evidence.playtest, verdict: 'INCONCLUSIVE' } });
  assert.equal(result.status, 'unverified');
  assert.equal(result.checks[3].status, 'unverified');
  assert.equal(evaluateReleasePreflight(health, projectPath, { ...evidence, playtest: { ...evidence.playtest, completed: false } }).status, 'unverified');
  assert.equal(evaluateReleasePreflight(health, projectPath, { ...evidence, playtest: { ...evidence.playtest, verdict: 'UNKNOWN' } }).status, 'unverified');
});

test('GUI issues and failed playtest block readiness', () => {
  const result = evaluateReleasePreflight(health, projectPath, {
    gui: { ...evidence.gui, outcome: 'issues' }, playtest: { ...evidence.playtest, verdict: 'FAIL' },
  });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.checks.slice(2).map(check => check.status), ['blocked', 'blocked']);
});
