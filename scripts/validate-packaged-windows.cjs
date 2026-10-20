'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const APP_ROOT = path.resolve(__dirname, '..');

function nonEmpty(file, minimum = 1) { try { return fs.statSync(file).isFile() && fs.statSync(file).size >= minimum; } catch (_) { return false; } }
function inspectPackage(packageRoot, version) {
  const required = [
    ['Forge.exe', 1024], ['resources/app.asar', 1024], ['resources/ForgePlugin.rbxmx', 1024],
    ['resources/runtimes/node-win-x64/node.exe', 1024], ['resources/runtimes/node-win-x64/integrity.json', 16],
    ['resources/runtimes/python-win-x64-u2net/python.exe', 1024], ['resources/runtimes/python-win-x64-u2net/integrity.json', 16],
    ['resources/robloxstudio-mcp/dist/index.js', 1024], ['resources/robloxstudio-mcp/package.json', 16],
  ];
  const failures = required.filter(([relative, minimum]) => !nonEmpty(path.join(packageRoot, relative), minimum)).map(([relative]) => `Absent ou vide : ${relative}`);
  const nativeRoot = path.join(packageRoot, 'resources', 'app.asar.unpacked', 'node_modules', 'node-pty');
  const nativeFound = fs.existsSync(nativeRoot) && fs.readdirSync(nativeRoot, { recursive: true }).some(name => String(name).endsWith('.node'));
  if (!nativeFound) failures.push('Module natif node-pty absent du paquet.');
  const installer = path.join(path.dirname(packageRoot), `Forge Setup ${version}.exe`);
  if (!nonEmpty(installer, 1024 * 1024)) failures.push(`Installateur courant absent : ${path.basename(installer)}`);
  else {
    const packageImage = path.join(packageRoot, 'resources', 'app.asar');
    if (fs.existsSync(packageImage) && fs.statSync(installer).mtimeMs < fs.statSync(packageImage).mtimeMs) failures.push('Installateur plus ancien que le paquet win-unpacked : reconstruire avant validation externe.');
  }
  return { ok: failures.length === 0, failures, installer, required: required.map(([relative]) => relative) };
}

function runPrivateRuntime(executable) {
  const command = "$ErrorActionPreference='Stop'; $p=Start-Process -FilePath $env:FORGE_VALIDATION_EXE -ArgumentList '--version' -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $env:FORGE_VALIDATION_OUT -RedirectStandardError $env:FORGE_VALIDATION_ERR; Get-Content $env:FORGE_VALIDATION_OUT,$env:FORGE_VALIDATION_ERR -ErrorAction SilentlyContinue; exit $p.ExitCode";
  const token = path.join(os.tmpdir(), `forge-runtime-${process.pid}`);
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 15000, env: { ...process.env, FORGE_VALIDATION_EXE: executable, FORGE_VALIDATION_OUT: `${token}.out`, FORGE_VALIDATION_ERR: `${token}.err` } });
  for (const file of [`${token}.out`, `${token}.err`]) fs.rmSync(file, { force: true });
  const version = String(result.stdout || result.stderr || '').trim();
  return { ok: result.status === 0 && /(?:^v\d+|Python\s+\d+)/m.test(version), version, error: result.error?.message || null };
}

async function launchPackagedApp(packageRoot) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-packaged-smoke-'));
  const executable = path.join(packageRoot, 'Forge.exe');
  try {
    const command = "$ErrorActionPreference='Stop'; $env:FORGE_TEST_PROFILE=$env:FORGE_VALIDATION_PROFILE; $env:FORGE_DISABLE_AUTO_UPDATE='1'; $p=Start-Process -FilePath $env:FORGE_VALIDATION_EXE -WindowStyle Hidden -PassThru; Start-Sleep -Seconds 7; if($p.HasExited){Write-Output ('EXITED:'+ $p.ExitCode); exit 1}; Write-Output ('RUNNING:'+ $p.Id); Stop-Process -Id $p.Id -Force; exit 0";
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 15000, env: { ...process.env, FORGE_VALIDATION_EXE: executable, FORGE_VALIDATION_PROFILE: profile } });
    return { running: result.status === 0 && /RUNNING:\d+/.test(result.stdout || ''), exitCode: result.status, detail: String(result.stdout || result.stderr || '').trim() };
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Ce contrôle vise le paquet Windows.');
  const pkg = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8'));
  const packageRoot = path.join(APP_ROOT, 'dist', 'win-unpacked');
  const inspection = inspectPackage(packageRoot, pkg.version);
  const node = runPrivateRuntime(path.join(packageRoot, 'resources/runtimes/node-win-x64/node.exe'));
  const python = runPrivateRuntime(path.join(packageRoot, 'resources/runtimes/python-win-x64-u2net/python.exe'));
  const launch = inspection.ok ? await launchPackagedApp(packageRoot) : { running: false, skipped: true };
  const report = { generatedAt: new Date().toISOString(), version: pkg.version, packageRoot, inspection, privateRuntimes: { node, python }, launch, limitations: ['Même PC de développement : ne valide pas encore une installation sur un second PC vierge.', 'Ne prouve pas une connexion réelle Codex/Claude ni une modification Studio.'] };
  const reportPath = path.join(APP_ROOT, 'dist', `packaged-windows-smoke-${pkg.version}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!inspection.ok || !node.ok || !python.ok || !launch.running) process.exitCode = 1;
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { inspectPackage, runPrivateRuntime };
