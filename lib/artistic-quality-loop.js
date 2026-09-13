const fs = require('fs');
const path = require('path');
const { trackEvent } = require('./media-metrics');

const MAX_ATTEMPTS = 5;
const ITERATION_DIR = '.forge-media/iterations';

function iterationPath(projectPath, modelId) {
  const dir = path.join(projectPath, ITERATION_DIR);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return path.join(dir, `${modelId}.json`);
}

function loadIteration(projectPath, modelId) {
  const p = iterationPath(projectPath, modelId);
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return null;
}

function saveIteration(projectPath, modelId, data) {
  fs.writeFileSync(iterationPath(projectPath, modelId), JSON.stringify(data, null, 2));
}

function createIterationState(modelId, modelPath, sourceFiles) {
  return {
    modelId,
    modelPath,
    sourceFiles: sourceFiles || [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentAttempt: 0,
    maxAttempts: MAX_ATTEMPTS,
    status: 'pending',
    attempts: [],
    lastDefects: null,
    lastCorrections: null,
    finalModelPath: null,
    finalRenders: [],
    metrics: {
      totalRenders: 0,
      totalCorrections: 0,
      totalAgentCalls: 0,
    }
  };
}

function addAttempt(state, attempt) {
  state.attempts.push({
    ...attempt,
    attemptNumber: state.currentAttempt,
    timestamp: Date.now()
  });
  state.updatedAt = Date.now();
}

function canContinue(state) {
  return state.currentAttempt < state.maxAttempts && state.status !== 'done' && state.status !== 'failed';
}

function getNextAttemptNumber(state) {
  return state.currentAttempt + 1;
}

function markAttemptStart(state, renderFiles) {
  state.currentAttempt++;
  state.status = 'rendering';
  state.lastRenders = renderFiles;
  state.metrics.totalRenders += renderFiles?.length || 0;
  state.updatedAt = Date.now();
}

function markRenderDone(state, renderFiles) {
  state.lastRenders = renderFiles;
  state.metrics.totalRenders += renderFiles.length;
  addAttempt(state, { renderFiles });
  state.status = 'inspecting';
  state.updatedAt = Date.now();
}

function markInspectionDone(state, defects, agentResponse) {
  state.lastDefects = defects;
  state.lastAgentResponse = agentResponse;
  state.status = defects && defects.length > 0 ? 'correcting' : 'done';
  state.updatedAt = Date.now();
}

function markCorrectionsDone(state, corrections, newModelPath) {
  state.lastCorrections = corrections;
  state.lastRenders = [];
  state.status = 'pending';
  if (newModelPath) state.modelPath = newModelPath;
  state.metrics.totalCorrections += corrections?.ops?.length || 0;
  state.updatedAt = Date.now();
}

function markComplete(state, finalModelPath, finalRenders) {
  state.status = 'done';
  state.finalModelPath = finalModelPath;
  state.finalRenders = finalRenders;
  state.updatedAt = Date.now();
}

function markFailed(state, error) {
  state.status = 'failed';
  state.error = error;
  state.updatedAt = Date.now();
}

function getIterationSummary(state) {
  return {
    modelId: state.modelId,
    currentAttempt: state.currentAttempt,
    maxAttempts: state.maxAttempts,
    status: state.status,
    canContinue: canContinue(state),
    attemptsCount: state.attempts.length,
    lastDefectsCount: state.lastDefects?.length || 0,
    totalRenders: state.metrics.totalRenders,
    totalCorrections: state.metrics.totalCorrections,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

function cleanupOldIterations(projectPath, keepLatest = 10) {
  const dir = path.join(projectPath, ITERATION_DIR);
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    if (files.length <= keepLatest) return;
    const withTime = files.map(f => ({
      name: f,
      mtime: fs.statSync(path.join(dir, f)).mtimeMs
    })).sort((a, b) => b.mtime - a.mtime);
    for (let i = keepLatest; i < withTime.length; i++) {
      try { fs.unlinkSync(path.join(dir, withTime[i].name)); } catch {}
    }
  } catch {}
}

module.exports = {
  MAX_ATTEMPTS,
  ITERATION_DIR,
  iterationPath,
  loadIteration,
  saveIteration,
  createIterationState,
  addAttempt,
  canContinue,
  getNextAttemptNumber,
  markAttemptStart,
  markRenderDone,
  markInspectionDone,
  markCorrectionsDone,
  markComplete,
  markFailed,
  getIterationSummary,
  cleanupOldIterations,
};