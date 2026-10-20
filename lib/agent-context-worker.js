'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { syncForgeContext } = require('./forge-context');

try {
  const result = syncForgeContext(workerData.projectPath, workerData.agentType, workerData.prompt);
  parentPort.postMessage({ success: true, result });
} catch (error) {
  parentPort.postMessage({ success: false, error: error.message || String(error) });
}
