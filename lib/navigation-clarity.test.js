'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('secondary screens use contextual return navigation instead of the old global bar', () => {
  const theme = read('lib/theme.js');
  assert.doesNotMatch(theme, /className\s*=\s*['"]forge-navigation/);
  assert.match(theme, /forge-simple-back/);
  assert.match(theme, /forge-project-back/);
});

test('projects page opens workspaces only from project cards', () => {
  const html = read('projects.html');
  assert.doesNotMatch(html, /startup-checks\.js|project-guide|resumeProjectBtn|openStudioBtn/);
  assert.match(html, /card\.addEventListener\('click', \(\) => openProject\(proj\)\)/);
  assert.match(html, /id="newProjectBtn"/);
});

test('settings show grouped categories with an explicit return button', () => {
  const html = read('settings.html');
  const script = read('lib/settings.js');
  const theme = read('lib/theme.js');
  assert.match(html, /id="settingsBack"/);
  assert.match(html, /id="guide"/);
  assert.match(script, /settingsCategories/);
  assert.match(script, /forgeSettingsReturnTarget/);
  assert.match(theme, /forge-settings-return/);
  assert.match(theme, /forgeSafeReturnTarget/);
  assert.match(script, /for\(const item of settingsSections\)item\.hidden=!category\.sections\.includes\(item\.id\)/);
});

test('settings return to the exact remembered primary screen', () => {
  const callbacks = {};
  const values = new Map();
  const classList = { add(){}, toggle(){}, contains(){ return false; } };
  const context = {
    URLSearchParams,
    location:{ pathname:'/workspace.html', search:'?project=42', hash:'#history' },
    localStorage:{ getItem(){ return null; }, setItem(){} },
    sessionStorage:{ getItem:key=>values.get(key)||null, setItem:(key,value)=>values.set(key,value) },
    matchMedia(){ return { matches:false, addEventListener(){} }; },
    document:{ documentElement:{ classList, dataset:{}, style:{} }, body:{ classList, prepend(){} }, addEventListener:(name,fn)=>{ callbacks[name]=fn; } },
    window:{ addEventListener(){}, forgeAPI:null },
  };
  vm.runInNewContext(read('lib/theme.js'),context);
  callbacks.DOMContentLoaded();
  assert.equal(values.get('forge-settings-return'),'workspace.html?project=42#history');
  context.location.pathname='/settings.html';context.location.search='';context.location.hash='';
  assert.equal(context.forgeSettingsReturnTarget(),'workspace.html?project=42#history');
  context.location.search='?from=projects.html';
  assert.equal(context.forgeSettingsReturnTarget(),'projects.html');
  context.location.search='?from=https://example.com';
  assert.equal(context.forgeSettingsReturnTarget(),'projects.html');
});

test('workspace keeps only project memory and AI testing in the project tools menu', () => {
  const html = read('workspace.html');
  assert.match(html, /class="project-tools-menu"/);
  assert.match(html, /<summary>Outils du projet<\/summary>/);
  for (const id of ['qualityMemoryBtn','qualityLabBtn']) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /id="sessionHandoffBtn"/);
  assert.doesNotMatch(html, /id="checkpointsBtn"/);
  assert.match(html, /onclick="requestAgentGameTest\(\)"/);
});

test('projects use a labelled settings icon instead of a text button', () => {
  const html = read('projects.html');
  assert.match(html, /class="settings-link"[^>]+aria-label="Paramètres"/);
  assert.doesNotMatch(html, /class="settings-link"[^>]*>Paramètres<\/a>/);
});

test('agents can be added directly without a provider selector', () => {
  const html = read('workspace.html');
  assert.doesNotMatch(html, /id="agentTypeChoice"/);
  assert.match(html, /createAgent\('codex'\)[^>]*>Codex \+<\/button>/);
  assert.match(html, /createAgent\('claude'\)[^>]*>Claude Code \+<\/button>/);
});

test('terminal resizing is grouped and ignores unchanged dimensions', () => {
  const html = read('workspace.html');
  assert.match(html, /function scheduleAgentFit/);
  assert.match(html, /width===fitWidth&&height===fitHeight/);
  assert.match(html, /await mountAgentPanel\(a\)/);
  assert.match(html, /await waitForPaint\(\)/);
});

test('toolbox reuses its cache and renders expensive previews lazily', () => {
  const html = read('workspace.html');
  const main = read('main.js');
  assert.match(html, /if\(tbCache\)renderToolbox\(\);else refreshToolbox\(\)/);
  assert.match(html, /new IntersectionObserver/);
  assert.match(html, /Math\.min\(index\+12,items\.length\)/);
  assert.match(html, /enqueueToolboxPreview/);
  assert.match(main, /await fs\.promises\.readdir/);
});

test('agent context preparation leaves the Electron main thread', () => {
  const main = read('main.js');
  const worker = read('lib/agent-context-worker.js');
  assert.match(main, /function prepareForgeAgentInstructionsAsync/);
  assert.match(main, /new Worker\(path\.join\(__dirname, 'lib', 'agent-context-worker\.js'\)/);
  assert.match(main, /await prepareForgeAgentInstructionsAsync\(projectPath, agentType\)/);
  assert.match(worker, /syncForgeContext\(workerData\.projectPath, workerData\.agentType, workerData\.prompt\)/);
});

test('Codex MCP setup cannot freeze the Electron main thread', () => {
  const main = read('main.js');
  const worker = read('lib/codex-mcp-worker.js');
  const buildCommand = main.slice(main.indexOf('function buildAgentShellCommand'), main.indexOf('function startMcpServer'));
  assert.match(main, /function ensureCodexMcpEntryAsync/);
  assert.match(main, /codexMcpSetupSignature/);
  assert.doesNotMatch(buildCommand, /ensureCodexMcp/);
  assert.match(worker, /ensureCodexMcp/);
});

test('project Studio page explains its purpose and file delivery', () => {
  const html = read('project-settings.html');
  assert.match(html, /À quoi sert cette page \?/);
  assert.match(html, /Studio et synchronisation/);
  assert.match(html, /Envoi automatique vers Studio/);
  assert.match(html, /workspace\.html#memory/);
  assert.match(html, /workspace\.html#handoff/);
  assert.match(html, /workspace\.html#history/);
  const workspace = read('workspace.html');
  assert.match(workspace, /location\.hash==='\#handoff'\)openSessionHandoff\(\)/);
});
