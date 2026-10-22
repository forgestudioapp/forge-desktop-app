'use strict';
const { execFile } = require('node:child_process');

function parseCodexAuthStatus(output) {
  const value = String(output || '').toLowerCase();
  if (/logged in using|authenticated|connexion active/.test(value)) return { state: 'connected' };
  if (/not logged in|not authenticated|login required/.test(value)) return { state: 'disconnected' };
  return { state: 'unknown' };
}

function getCodexAuthStatus(run = execFile) {
  return new Promise(resolve => {
    const command = process.platform === 'win32' ? 'cmd.exe' : 'codex';
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'codex login status'] : ['login', 'status'];
    run(command, args, { windowsHide: true, timeout: 12000, maxBuffer: 65536, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error?.killed || error?.code === 'ENOENT') return resolve({ state: 'unknown' });
      resolve(parseCodexAuthStatus(`${stdout || ''}\n${stderr || ''}`));
    });
  });
}

module.exports = { parseCodexAuthStatus, getCodexAuthStatus };
