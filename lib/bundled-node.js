const fs = require('node:fs');
const path = require('node:path');
function configureBundledNode({ resourcesDir, userDataDir, env = process.env, platform = process.platform }) {
  const directory = path.join(resourcesDir, 'runtimes', 'node-win-x64');
  const executable = path.join(directory, 'node.exe');
  if (platform !== 'win32' || !fs.existsSync(executable)) return 'node';
  const prefix = path.join(userDataDir, 'agent-tools');
  // Windows environment keys are case-insensitive; keep a single PATH key.
  const keys = Object.keys(env).filter(key => key.toLowerCase() === 'path');
  const existing = keys.map(key => env[key]).filter(Boolean).join(';');
  for (const key of keys) delete env[key];
  env.PATH = [directory, prefix, ...existing.split(';').filter(p => p && p !== directory && p !== prefix)].join(';');
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'npm_config_prefix') delete env[key];
  env.NPM_CONFIG_PREFIX = prefix;
  return executable;
}
module.exports = { configureBundledNode };
