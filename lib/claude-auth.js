const { execFile } = require('node:child_process');

function parseAuthStatus(stdout) {
  try {
    const value = JSON.parse(stdout);
    if (typeof value.loggedIn !== 'boolean') return { state: 'unknown' };
    // Return status only; never forward account identifiers or credentials.
    return { state: value.loggedIn ? 'connected' : 'disconnected' };
  } catch { return { state: 'unknown' }; }
}

function getClaudeAuthStatus(run = execFile) {
  return new Promise(resolve => {
    const command = process.platform === 'win32' ? 'cmd.exe' : 'claude';
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'claude auth status'] : ['auth', 'status'];
    run(command, args, { windowsHide: true, timeout: 12000, maxBuffer: 65536, encoding: 'utf8' }, (error, stdout) => {
      // The official CLI exits 1 for a valid disconnected response.
      if (error?.killed || error?.code === 'ENOENT') return resolve({ state: 'unknown' });
      resolve(parseAuthStatus(stdout));
    });
  });
}
module.exports = { parseAuthStatus, getClaudeAuthStatus };
