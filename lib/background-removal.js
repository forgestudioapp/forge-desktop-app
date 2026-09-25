const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

function createBackgroundRemoval({ runtimeDir, cacheDir, platform = process.platform, arch = process.arch, execute = execFile }) {
  let pending = Promise.resolve();
  let health;
  const python = path.join(runtimeDir, 'python.exe');
  const script = path.join(runtimeDir, 'remove-background.py');
  function invoke(args, timeout) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const env = { ...process.env, NUMBA_CACHE_DIR: cacheDir };
    // Python's -I and explicit executable also isolate this from PATH and PYTHONPATH.
    for (const key of Object.keys(env)) if (/^PYTHON|^U2NET|^MODEL_CHECKSUM_DISABLED$/i.test(key)) delete env[key];
    return new Promise((resolve, reject) => execute(python, ['-I', '-B', script, ...args],
      { windowsHide: true, shell: false, timeout, maxBuffer: 1024 * 1024, env },
      (error, stdout, stderr) => error ? reject(new Error(error.killed ? 'Le détourage a dépassé le délai autorisé.' : (stderr || error.message).slice(-600))) : resolve(stdout)));
  }
  async function status() {
    if (platform !== 'win32' || arch !== 'x64') return { installed: false, error: 'Le détourage intégré est disponible pour Windows x64.' };
    if (!fs.existsSync(python) || !fs.existsSync(script) || !fs.existsSync(path.join(runtimeDir, 'models/u2netp.onnx'))) {
      return { installed: false, error: 'Le moteur de détourage intégré est manquant. Réinstalle ou mets à jour Forge.' };
    }
    if (!health) health = invoke(['--check'], 120000).then(() => ({ installed: true, version: 'U²-Net', bundled: true }))
      .catch(error => { health = undefined; return { installed: false, error: error.message }; });
    return health;
  }
  function remove(inputPath) {
    const run = async () => {
      try {
        if (typeof inputPath !== 'string' || !fs.statSync(inputPath).isFile()) throw new Error('Fichier introuvable');
        const state = await status();
        if (!state.installed) throw new Error(state.error);
        const parsed = path.parse(inputPath);
        const output = path.join(parsed.dir, parsed.name + '_nobg.png');
        await invoke([inputPath, output], 120000);
        if (!fs.statSync(output).size) throw new Error('Le détourage n’a produit aucune image.');
        return { success: true, path: output };
      } catch (error) { return { success: false, error: error.message }; }
    };
    // Avoid starting several large inference processes at once.
    const result = pending.then(run, run);
    pending = result.catch(() => {});
    return result;
  }
  return { status, remove };
}
module.exports = { createBackgroundRemoval };
