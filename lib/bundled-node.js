const fs = require('node:fs');
const path = require('node:path');
const { nodeRuntimeExecutable, npmGlobalBin, mergePath } = require('./platform-support');
function configureBundledNode({ resourcesDir, userDataDir, env = process.env, platform = process.platform, arch = process.arch }) {
  const executable = nodeRuntimeExecutable(resourcesDir, platform, arch);
  if (!executable || !fs.existsSync(executable)) return 'node';
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const directory = pathApi.dirname(executable);
  const prefix = pathApi.join(userDataDir, 'agent-tools');
  mergePath(env, [directory, npmGlobalBin(prefix, platform)], platform);
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'npm_config_prefix') delete env[key];
  env.NPM_CONFIG_PREFIX = prefix;
  return executable;
}
module.exports = { configureBundledNode };
