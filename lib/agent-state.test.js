const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { createAgentStateStore, agentProjectKey, sameAgentProject } = require('./agent-state');
const root = path.join(__dirname, '..');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ForgeValidation_AgentState_'));
  t.after(() => {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const a = path.join(dir, 'A'), b = path.join(dir, 'B'), file = path.join(dir, 'agents-state.json');
  fs.mkdirSync(a); fs.mkdirSync(b);
  return { dir, a, b, file, store: createAgentStateStore(file) };
}
const state = (id, draft, sessionId = id) => ({ agents: [{ id, agentType: 'codex', name: id, draft, sessionId }], agentCounter: { codex: 2 } });

test('A → B → A keeps distinct drafts and reconnects only each project’s PTYs', t => {
  const { a, b, store, file } = fixture(t);
  const sessions = new Map([['a', { projectPath: a }], ['b', { projectPath: b }]]);
  store.save(a, state('a', 'Brouillon A')); store.save(b, state('b', 'Brouillon B'));
  assert.equal(store.load(a, sessions).agents[0].draft, 'Brouillon A');
  assert.equal(store.load(b, sessions).agents[0].sessionId, 'b');
  store.save(a, state('a', 'Dernière saisie A'));
  assert.equal(store.load(b, sessions).agents[0].draft, 'Brouillon B');
  const restarted = createAgentStateStore(file);
  assert.equal(restarted.load(a).agents[0].draft, 'Dernière saisie A');
  assert.equal(restarted.load(a).agents[0].sessionId, null);
  assert.equal(store.load(a, sessions).agents[0].sessionId, 'a');
  store.save(a, state('a', 'Wrong PTY', 'b'));
  assert.equal(store.load(a, sessions).agents[0].sessionId, null);
});

test('clearing one project keeps the other and equivalent paths share one key', t => {
  const { a, b, store } = fixture(t);
  store.save(a, state('a', 'A')); store.save(b, state('b', 'B'));
  assert.equal(agentProjectKey(a), agentProjectKey(path.join(a, '.')));
  if (process.platform === 'win32') assert.equal(agentProjectKey(a), agentProjectKey(a.toUpperCase()));
  store.clear(a);
  assert.deepEqual(store.load(a).agents, []);
  assert.equal(store.load(b).agents[0].draft, 'B');
});

test('legacy migration uses the previously active project, not the next one opened', t => {
  const { a, b, file, dir, store } = fixture(t);
  const active = path.join(dir, 'active-project.json');
  fs.writeFileSync(file, JSON.stringify(state('old', 'Ancien brouillon')));
  fs.writeFileSync(active, JSON.stringify({ path: a }));
  assert.equal(store.migrateLegacy(active), true);
  fs.writeFileSync(active, JSON.stringify({ path: b }));
  assert.equal(store.migrateLegacy(active), false);
  assert.deepEqual(store.load(b).agents, []);
  assert.equal(store.load(a).agents[0].draft, 'Ancien brouillon');
});

test('unassigned legacy and corrupt state are preserved instead of reassigned or overwritten', t => {
  const { a, file, dir, store } = fixture(t);
  fs.writeFileSync(file, JSON.stringify(state('old', 'À retrouver')));
  assert.equal(store.migrateLegacy(path.join(dir, 'missing.json')), false);
  store.save(a, state('a', 'Nouveau'));
  assert.equal(JSON.parse(fs.readFileSync(file)).unassignedLegacy.agents[0].draft, 'À retrouver');
  fs.writeFileSync(file, '{broken');
  assert.throws(() => store.save(a, state('a', 'New')));
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});

test('failed atomic replacement keeps the previous drafts intact', t => {
  const { a, file, dir, store } = fixture(t);
  store.save(a, state('a', 'Original'));
  const before = fs.readFileSync(file, 'utf8');
  t.mock.method(fs, 'renameSync', () => { throw new Error('locked'); });
  assert.throws(() => store.save(a, state('a', 'New')), /locked/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(fs.readdirSync(dir).some(name => name.endsWith('.tmp')), false);
});

test('actual IPC handlers isolate state, flush the closing page and reject a wrong-project reconnect', async t => {
  const { a, b, dir } = fixture(t);
  const handlers = new Map(), events = new Map(); let reconnected = 0;
  const sessions = new Map([['liveA', { projectPath: a, outputRelay: { setSender() { reconnected++; return true; } } }]]);
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const source = main.slice(main.indexOf('function saveProjectAgentState('), main.indexOf("ipcMain.handle('agent-install'"));
  vm.runInNewContext(source, { createAgentStateStore, sameAgentProject, PTYS: sessions, console,
    userDataFile: name => path.join(dir, name), ipcMain: { handle: (name, fn) => handlers.set(name, fn), on: (name, fn) => events.set(name, fn) } });
  await handlers.get('save-agent-state')({}, a, state('a', 'A', 'liveA'));
  await handlers.get('save-agent-state')({}, b, state('b', 'B'));
  const closeEvent = {};
  events.get('save-agent-state-on-close')(closeEvent, a, state('a', 'Dernière touche', 'liveA'));
  assert.equal(closeEvent.returnValue.success, true);
  assert.equal((await handlers.get('load-agent-state')({}, a)).agents[0].draft, 'Dernière touche');
  assert.equal((await handlers.get('load-agent-state')({}, b)).agents[0].draft, 'B');
  assert.ok((await handlers.get('reconnect-pty')({ sender: {} }, 'liveA', b)).error);
  assert.equal(reconnected, 0);
  assert.equal((await handlers.get('reconnect-pty')({ sender: {} }, 'liveA', a)).success, true);
  assert.equal(reconnected, 1);
  await handlers.get('clear-agent-state')({}, b);
  assert.equal((await handlers.get('load-agent-state')({}, a)).agents.length, 1);
});

test('actual window close keeps saved drafts for the next launch', t => {
  const { a, file, dir, store } = fixture(t);
  store.save(a, state('a', 'À conserver'));
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  let close;
  vm.runInNewContext(main.slice(main.indexOf("app.on('window-all-closed'")), {
    app: { on: (_, fn) => { close = fn; }, quit() {} }, process: { platform: 'win32' },
    stopFileSync() {}, mcpServerProcess: null, syncMcpProcess: null,
    userDataFile: name => path.join(dir, name), removeIfExists: file => fs.rmSync(file, { force: true })
  });
  close();
  assert.equal(createAgentStateStore(file).load(a).agents[0].draft, 'À conserver');
});

test('actual page ignores saves before restore and saves to its captured project on departure', async () => {
  const workspace = fs.readFileSync(path.join(root, 'workspace.html'), 'utf8');
  const saves = [], listeners = new Map();
  const context = vm.createContext({ agentStateReady: false, stateProjectPath: '/original',
    activeProject: { path: '/next' }, agents: state('a', 'a b').agents, agentCounter: { codex: 2 },
    setTimeout, clearTimeout, console, window: {
      addEventListener: (name, fn) => listeners.set(name, fn), forgeAPI: {
        saveAgentState: (...args) => { saves.push(args); return { success: true }; },
        saveAgentStateOnClose: (...args) => { saves.push(args); return { success: true }; }
      }
    } });
  vm.runInContext(workspace.slice(workspace.indexOf('let draftSaveTimer='), workspace.indexOf('async function loadProject()')), context);
  await context.saveAgentState();
  assert.equal(saves.length, 0);
  context.agentStateReady = true;
  listeners.get('pagehide')();
  assert.equal(saves[0][0], '/original');
  assert.equal(saves[0][1].agents[0].draft, 'a b');
});
