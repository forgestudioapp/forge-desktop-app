'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const APP_ROOT = path.resolve(__dirname, '..');

function existsAndNonEmpty(target, minimum = 1) {
  try { return fs.statSync(target).size >= minimum; } catch (_) { return false; }
}

function configuredSourceRoot(root, value) {
  const clean = String(value).replace(/[/\\]\*\*\/\*$/, '');
  return path.resolve(root, clean);
}

function pluginVersion(source) {
  const match = String(source).match(/CURRENT_VERSION\s*=\s*["']([^"']+)["']/);
  return match && match[1];
}

function inspectReleaseInputs(root = APP_ROOT, platform = process.platform) {
  const failures = [];
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pkg.version || '')) failures.push('Version package.json invalide.');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) failures.push('Les versions de package.json et package-lock.json sont différentes.');
  const signExts = pkg.build?.win?.signExts || [];
  if (!signExts.includes('.node')) failures.push('Les modules natifs .node ne sont pas inclus dans la signature Windows.');

  for (const entry of pkg.build?.files || []) {
    const target = configuredSourceRoot(root, entry);
    if (!fs.existsSync(target)) failures.push(`Fichier emballé introuvable : ${entry}`);
  }
  const platformKey = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : null;
  const resources = [...(pkg.build?.extraResources || []), ...(platformKey ? pkg.build?.[platformKey]?.extraResources || [] : [])];
  for (const resource of resources) {
    const target = path.resolve(root, resource.from);
    if (!fs.existsSync(target)) failures.push(`Ressource embarquée introuvable : ${resource.from}`);
  }

  const pluginPath = path.join(root, 'ForgePlugin.rbxmx');
  if (!existsAndNonEmpty(pluginPath, 1024)) failures.push('Plugin Forge absent ou vide.');
  const mcpPackagePath = path.resolve(root, '../robloxstudio-mcp/package.json');
  const mcpDistPath = path.resolve(root, '../robloxstudio-mcp/dist/index.js');
  if (!existsAndNonEmpty(mcpDistPath, 1024)) failures.push('Transport MCP compilé absent ou vide.');
  if (!fs.existsSync(mcpPackagePath)) failures.push('package.json du MCP absent.');
  if (fs.existsSync(pluginPath) && fs.existsSync(mcpPackagePath)) {
    const plugin = pluginVersion(fs.readFileSync(pluginPath, 'utf8'));
    const mcp = JSON.parse(fs.readFileSync(mcpPackagePath, 'utf8')).version;
    if (!plugin || plugin !== mcp) failures.push(`Versions plugin/MCP différentes : ${plugin || 'inconnue'} / ${mcp || 'inconnue'}.`);
  }

  const requiredRuntimes = platform === 'darwin'
    ? ['runtimes/node-darwin-arm64/bin/node', 'runtimes/node-darwin-x64/bin/node']
    : ['runtimes/node-win-x64/node.exe', 'runtimes/python-win-x64-u2net/python.exe'];
  for (const runtime of requiredRuntimes) {
    if (!existsAndNonEmpty(path.join(root, runtime), 1024)) failures.push(`Runtime Forge absent ou vide : ${runtime}`);
  }
  return { ok: failures.length === 0, failures, version: pkg.version };
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function hashArtifacts(directory, manifestPath) {
  const allowed = /\.(?:exe|dmg|zip)$/i;
  const files = fs.existsSync(directory)
    ? fs.readdirSync(directory, { withFileTypes: true }).filter(item => item.isFile() && allowed.test(item.name)).map(item => path.join(directory, item.name))
    : [];
  if (!files.length) throw new Error(`Aucun installateur trouvé dans ${directory}`);
  const manifest = {
    generatedAt: new Date().toISOString(),
    files: files.map(file => ({ name: path.basename(file), bytes: fs.statSync(file).size, sha256: sha256(file) })),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function run(label, command, args, cwd) {
  process.stdout.write(`\n[release-gate] ${label}\n`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0) throw result.error || new Error(`${label} a échoué (code ${result.status}).`);
}

function runNpm(label, args, cwd) {
  const bundledCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const cli = process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)
    ? process.env.npm_execpath
    : (fs.existsSync(bundledCli) ? bundledCli : null);
  if (cli) return run(label, process.execPath, [cli, ...args], cwd);
  return run(label, 'npm', args, cwd);
}

function main(argv = process.argv.slice(2)) {
  const skipTests = argv.includes('--skip-tests');
  const artifactIndex = argv.indexOf('--artifacts');
  const manifestIndex = argv.indexOf('--manifest');
  const inspection = inspectReleaseInputs();
  if (!inspection.ok) throw new Error(inspection.failures.join('\n'));
  console.log(`[release-gate] Entrées de livraison Forge ${inspection.version} vérifiées.`);

  if (!skipTests) {
    run('Syntaxe Electron', process.execPath, ['--check', 'main.js'], APP_ROOT);
    run('Syntaxe preload', process.execPath, ['--check', 'preload.js'], APP_ROOT);
    runNpm('Tests Forge', ['test'], APP_ROOT);
    run('Runtime Node embarqué', process.execPath, ['scripts/verify-node-runtime.cjs'], APP_ROOT);
    if (process.platform === 'win32') run('Runtime Python embarqué', process.execPath, ['scripts/verify-python-runtime.cjs'], APP_ROOT);
    runNpm('Tests du transport MCP', ['test', '--', '--runInBand'], path.resolve(APP_ROOT, '../robloxstudio-mcp'));
  }

  if (artifactIndex !== -1) {
    const directory = path.resolve(APP_ROOT, argv[artifactIndex + 1] || 'dist');
    const manifest = path.resolve(APP_ROOT, manifestIndex !== -1 ? argv[manifestIndex + 1] : path.join(directory, 'release-checksums.json'));
    const result = hashArtifacts(directory, manifest);
    console.log(`[release-gate] ${result.files.length} installateur(s) haché(s) dans ${manifest}.`);
  }
  console.log('\n[release-gate] Livraison validée.');
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`\n[release-gate] ÉCHEC\n${error.message}`); process.exitCode = 1; }
}

module.exports = { inspectReleaseInputs, pluginVersion, hashArtifacts };
