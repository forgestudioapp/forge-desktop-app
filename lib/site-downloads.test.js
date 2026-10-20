'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'docs', 'landing.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'build.yml'), 'utf8');

test('public website offers permanent Windows, Apple Silicon and Intel downloads', () => {
  assert.match(html, /releases\/latest\/download\/Forge-Windows-x64\.exe/);
  assert.match(html, /releases\/latest\/download\/Forge-macOS-arm64\.dmg/);
  assert.match(html, /releases\/latest\/download\/Forge-macOS-x64\.dmg/);
  assert.doesNotMatch(html, /releases\/download\/v1\.5\.5/);
  assert.match(html, /Windows et macOS/);
  assert.doesNotMatch(html, /Cette version de Forge est proposée pour Windows/);
});

test('download button detects macOS without guessing Apple Silicon versus Intel', () => {
  new vm.Script(script, { filename: 'docs/landing.js' });
  assert.match(script, /isMac/);
  assert.match(script, /Télécharger pour Mac/);
  assert.match(script, /downloadDialog\.showModal/);
  assert.match(html, /À propos de ce Mac/);
});

test('release workflow creates the stable filenames before publishing', () => {
  assert.match(workflow, /create-release-aliases\.cjs --platform=windows/);
  assert.match(workflow, /create-release-aliases\.cjs --platform=macos/);
  assert.match(workflow, /dist\/\*\.dmg/);
  assert.match(workflow, /dist\/\*\.exe/);
});
