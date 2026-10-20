const { app } = require('electron');

function runPty(spawn, shellCommand, expected) {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || 'sh');
    const args = process.platform === 'win32' ? ['/d', '/q', '/c', shellCommand] : ['-lc', shellCommand];
    const child = spawn(command, args, { name: 'xterm-color', cols: 80, rows: 24, cwd: __dirname, env: process.env });
    let output = '';
    child.onData(chunk => { output += chunk; });
    child.onExit(({ exitCode }) => {
      if (exitCode === 0 && expected.test(output)) resolve(output.trim());
      else reject(new Error(`${shellCommand} a échoué (code ${exitCode}) : ${output}`));
    });
  });
}

app.whenReady().then(async () => {
  const timer = setTimeout(() => { console.error('[PTY] Vérification expirée.');app.exit(1); }, 15000);
  try {
    const { spawn } = require('node-pty');
    await runPty(spawn, 'echo FORGE_PTY_OK', /FORGE_PTY_OK/);
    const codex = await runPty(spawn, 'codex --version', /codex/i);
    const claude = await runPty(spawn, 'claude --version', /\d+\.\d+/);
    clearTimeout(timer);
    console.log(`[PTY] Terminal Electron fonctionnel · ${codex} · Claude ${claude}`);
    app.exit(0);
  } catch (error) {
    clearTimeout(timer);
    console.error(`[PTY] ${error.message}`);
    app.exit(1);
  }
});
