'use strict';

const fs = require('node:fs');
const path = require('node:path');

function filesIn(distDir) {
  return fs.readdirSync(distDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name);
}

function exactlyOne(files, predicate, description) {
  const matches = files.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${description}: ${matches.length} fichier(s) trouvé(s): ${matches.join(', ') || 'aucun'}`);
  }
  return matches[0];
}

function copyAlias(distDir, sourceName, aliasName) {
  const source = path.join(distDir, sourceName);
  const destination = path.join(distDir, aliasName);
  fs.copyFileSync(source, destination);
  const sourceSize = fs.statSync(source).size;
  if (!sourceSize || fs.statSync(destination).size !== sourceSize) {
    throw new Error(`Alias de livraison incomplet: ${aliasName}`);
  }
  return { sourceName, aliasName, size: sourceSize };
}

function createReleaseAliases(distDir, platform) {
  const files = filesIn(distDir);
  if (platform === 'windows') {
    const source = exactlyOne(
      files,
      name => name.toLowerCase().endsWith('.exe') && name !== 'Forge-Windows-x64.exe',
      'Installateur Windows'
    );
    return [copyAlias(distDir, source, 'Forge-Windows-x64.exe')];
  }
  if (platform === 'macos') {
    return ['arm64', 'x64'].map(arch => {
      const alias = `Forge-macOS-${arch}.dmg`;
      const source = exactlyOne(
        files,
        name => name.toLowerCase().endsWith(`-mac-${arch}.dmg`) && name !== alias,
        `Installateur macOS ${arch}`
      );
      return copyAlias(distDir, source, alias);
    });
  }
  throw new Error(`Plateforme inconnue: ${platform}`);
}

if (require.main === module) {
  const platform = process.argv.find(arg => arg.startsWith('--platform='))?.split('=')[1];
  const distArg = process.argv.find(arg => arg.startsWith('--dist='))?.slice('--dist='.length) || 'dist';
  const distDir = path.resolve(distArg);
  const aliases = createReleaseAliases(distDir, platform);
  for (const item of aliases) console.log(`[release-alias] ${item.aliasName} <- ${item.sourceName} (${item.size} octets)`);
}

module.exports = { createReleaseAliases };
