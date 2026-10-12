const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function collectCompiledScripts(projectPath) {
  const root = path.join(projectPath, 'out');
  const scripts = new Map();
  function visit(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && /\.luau?$/i.test(entry.name)) {
        const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');
        const source = fs.readFileSync(fullPath, 'utf8');
        const hash = crypto.createHash('sha256').update(source).digest('hex');
        scripts.set(relativePath, { source, hash });
      }
    }
  }
  visit(root);
  return scripts;
}

function changedCompiledScripts(previous, current) {
  return [...current].filter(([name, entry]) => previous.get(name) !== entry.hash);
}

module.exports = { collectCompiledScripts, changedCompiledScripts };
