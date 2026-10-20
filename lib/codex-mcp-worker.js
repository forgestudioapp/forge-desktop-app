const { parentPort, workerData } = require('node:worker_threads');
const { ensureCodexMcp } = require('./codex-mcp-setup');

try {
  ensureCodexMcp({
    nodeCommand: workerData.nodeCommand,
    serverPath: workerData.serverPath,
    env: workerData.env,
  });
  parentPort.postMessage({ success: true });
} catch (error) {
  parentPort.postMessage({ success: false, error: error.message });
}
