'use strict';
const path = require('node:path');
const platformPath = platform => platform === 'win32' ? path.win32 : path.posix;

function nodeRuntimeName(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return 'node-win-x64';
  if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) return `node-darwin-${arch}`;
  return null;
}

function nodeRuntimeExecutable(resourcesDir, platform = process.platform, arch = process.arch) {
  const runtime = nodeRuntimeName(platform, arch);
  if (!runtime) return null;
  return platformPath(platform).join(resourcesDir, 'runtimes', runtime, platform === 'win32' ? 'node.exe' : 'bin/node');
}

function npmGlobalBin(prefix, platform = process.platform) {
  return platform === 'win32' ? prefix : path.posix.join(prefix, 'bin');
}

function robloxLocations({ platform = process.platform, home, localAppData } = {}) {
  if (platform === 'win32') {
    const root = path.win32.join(localAppData || '', 'Roblox');
    return { studioCandidates: [root], pluginsDir: path.win32.join(root, 'Plugins'), displayPath: '%LOCALAPPDATA%\\Roblox' };
  }
  if (platform === 'darwin') {
    return {
      studioCandidates: ['/Applications/RobloxStudio.app', path.posix.join(home || '', 'Applications', 'RobloxStudio.app')],
      pluginsDir: path.posix.join(home || '', 'Documents', 'Roblox', 'Plugins'),
      displayPath: '~/Documents/Roblox/Plugins'
    };
  }
  return { studioCandidates: [], pluginsDir: platformPath(platform).join(home || '', 'Documents', 'Roblox', 'Plugins'), displayPath: '' };
}

function memoryMcpExecutable(platform = process.platform) {
  if (platform === 'win32') return 'codebase-memory-mcp.exe';
  if (platform === 'darwin') return 'codebase-memory-mcp';
  return 'codebase-memory-mcp';
}

function macPathCandidates(home) {
  return [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.posix.join(home || '', '.local', 'bin'),
    path.posix.join(home || '', '.npm-global', 'bin'),
    path.posix.join(home || '', '.claude', 'local', 'bin')
  ];
}

function mergePath(env, additions, platform = process.platform) {
  const delimiter = platform === 'win32' ? ';' : ':';
  const pathKeys = Object.keys(env).filter(key => key.toLowerCase() === 'path');
  const existing = pathKeys.flatMap(key => String(env[key] || '').split(delimiter)).filter(Boolean);
  for (const key of pathKeys) delete env[key];
  const seen = new Set();
  const values = [...additions, ...existing].filter(value => {
    if (!value) return false;
    const key = platform === 'win32' ? value.toLowerCase() : value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  env.PATH = values.join(delimiter);
  return env.PATH;
}

module.exports = { nodeRuntimeName, nodeRuntimeExecutable, npmGlobalBin, robloxLocations, memoryMcpExecutable, macPathCandidates, mergePath };
