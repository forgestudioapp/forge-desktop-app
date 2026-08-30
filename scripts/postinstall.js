/**
 * postinstall.js — Patch node-pty gyp files to disable Spectre Mitigation.
 * The VS Build Tools on many machines do not ship Spectre-mitigated libraries,
 * which causes node-gyp to fail. This script patches the gyp files before
 * electron-rebuild compiles them.
 */
const fs = require('fs');
const path = require('path');

const targets = [
  'node_modules/node-pty/binding.gyp',
  'node_modules/node-pty/deps/winpty/src/winpty.gyp',
];

let patched = 0;

for (const rel of targets) {
  const filePath = path.join(__dirname, '..', rel);
  if (!fs.existsSync(filePath)) continue;
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  content = content.replace(/'SpectreMitigation':\s*'Spectre'/g, "'SpectreMitigation': 'false'");
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    patched++;
    console.log(`[postinstall] Patched ${rel}`);
  }
}

if (patched > 0) {
  console.log(`[postinstall] ${patched} file(s) patched for SpectreMitigation=false`);
} else {
  console.log('[postinstall] No SpectreMitigation patching needed');
}
