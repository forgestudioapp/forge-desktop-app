'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  FIGMA_MCP_URL,
  configureCommand,
  loginCommand,
  normalizeState,
  updateAgentState,
  claudeServerEntry,
} = require('./figma-mcp');

test('les commandes Figma utilisent le serveur officiel et des arguments fixes', () => {
  assert.deepEqual(configureCommand('codex'), {
    command: 'codex', args: ['mcp', 'add', 'figma', '--url', FIGMA_MCP_URL]
  });
  assert.deepEqual(configureCommand('claude'), {
    command: 'claude', args: ['mcp', 'add', '--transport', 'http', '--scope', 'user', 'figma', FIGMA_MCP_URL]
  });
  assert.deepEqual(loginCommand('codex').args, ['mcp', 'login', 'figma']);
  assert.throws(() => configureCommand('autre'), /non pris en charge/);
});

test('la configuration Claude expose Figma seulement après activation', () => {
  const empty = normalizeState(null);
  assert.deepEqual(claudeServerEntry(empty), {});
  const connected = updateAgentState(empty, 'claude', { configured: true, connected: true });
  assert.deepEqual(claudeServerEntry(connected), {
    figma: { type: 'http', url: FIGMA_MCP_URL }
  });
  assert.equal(connected.agents.codex.connected, false);
});

test('Forge relie Figma aux paramètres, à Codex, à Claude et au pont Roblox', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'settings.html'), 'utf8');
  const prompt = fs.readFileSync(path.join(root, 'forge-system-prompt.md'), 'utf8');
  assert.match(main, /ipcMain\.handle\('figma-connect'/);
  assert.match(main, /\.\.\.claudeServerEntry\(loadFigmaState\(\)\)/);
  assert.match(main, /mcp__figma__\*/);
  assert.match(preload, /connectFigma:/);
  assert.match(settings, /id="connectFigmaCodexBtn"/);
  assert.match(settings, /id="connectFigmaClaudeBtn"/);
  assert.match(prompt, /Figma vers une interface Roblox/);
  assert.match(prompt, /pont Forge Roblox/);
});
