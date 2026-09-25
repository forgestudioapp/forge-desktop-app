const { parentPort, workerData } = require('node:worker_threads');
const {
  createProjectCheckpoint,
  restoreProjectCheckpoint,
  deleteProjectCheckpoint,
  pruneAutomaticProjectCheckpoints,
} = require('./project-checkpoints');

try {
  let result;
  if (workerData.action === 'create') {
    result = createProjectCheckpoint(workerData.options);
    if (workerData.options.reason !== 'manual') {
      pruneAutomaticProjectCheckpoints({
        projectPath: workerData.options.projectPath,
        storageRoot: workerData.options.storageRoot,
        keep: 12,
      });
    }
  } else if (workerData.action === 'restore') {
    result = restoreProjectCheckpoint(workerData.options);
    pruneAutomaticProjectCheckpoints({
      projectPath: workerData.options.projectPath,
      storageRoot: workerData.options.storageRoot,
      keep: 12,
    });
  } else if (workerData.action === 'delete') {
    result = deleteProjectCheckpoint(workerData.options);
  } else {
    throw new Error('Action de point de retour inconnue.');
  }
  parentPort.postMessage({ success: true, result });
} catch (error) {
  parentPort.postMessage({ success: false, error: error.message });
}
