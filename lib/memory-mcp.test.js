const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { EventEmitter } = require('events');
const { PassThrough, Writable } = require('stream');
const { spawn } = require('child_process');
const { MemoryMcp } = require('./memory-mcp');

function setup(t, respond) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-memory-'));
  const projects = ['Project A', 'Project B'].map(name => {
    const dir = path.join(root, name);
    fs.mkdirSync(dir);
    return dir;
  });
  const children = [];
  const service = new MemoryMcp({ getBinary: () => process.execPath, timeoutMs: 1000,
    spawnProcess(binary, args, options) {
      assert.equal(options.shell, false);
      assert.equal(options.windowsHide, true);
      const child = new EventEmitter();
      child.project = args[args.indexOf('--project') + 1];
      child.messages = [];
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => { child.killed = true; };
      child.stdin = new Writable({ write(data, encoding, done) {
        const message = JSON.parse(data.toString());
        child.messages.push(message);
        done();
        if (respond) respond(child, message);
        else if (message.id) child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id,
          result: { project: child.project, method: message.method } }) + '\n');
      } });
      children.push(child);
      return child;
    },
  });
  t.after(() => { service.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { service, projects, children };
}

test('initializes on demand once, without waiting for its own ready flag', async t => {
  const { service, projects, children } = setup(t);
  assert.equal(children.length, 0);
  await service.call(projects[0], 'search_graph', {});
  await service.call(projects[0], 'get_architecture', {});
  assert.equal(children.length, 1);
  assert.deepEqual(children[0].messages.map(m => m.method), ['initialize', 'notifications/initialized', 'tools/call', 'tools/call']);
});

test('concurrent projects use their requested path and old exit events cannot reset new session', async t => {
  const { service, projects, children } = setup(t);
  const results = await Promise.all(projects.map(project => service.call(project, 'search_graph', {})));
  assert.deepEqual(results.map(result => result.project), projects.map(p => fs.realpathSync(p)));
  assert.equal(children[0].killed, true);
  children[0].emit('exit', 0);
  await service.call(projects[1], 'get_architecture', {});
  assert.equal(children.length, 2);
});

test('handles fragmented UTF-8, CRLF, notifications and several messages in one chunk', async t => {
  const { service, projects } = setup(t, (child, message) => {
    if (!message.id) return;
    const payload = Buffer.from('diagnostic\n' + JSON.stringify({ method: 'notifications/progress' }) + '\n' +
      JSON.stringify({ id: message.id, result: 'arbre été 🌳' }) + '\r\n');
    for (const byte of payload) child.stdout.write(Buffer.from([byte]));
  });
  assert.equal(await service.call(projects[0], 'search_graph', {}), 'arbre été 🌳');
});

test('timeout stops the failed child and next request recovers without replaying a tool', async t => {
  let fail = true;
  const { service, projects, children } = setup(t, (child, message) => {
    if (message.id && (message.method === 'initialize' || !fail)) child.stdout.write(JSON.stringify({ id: message.id, result: 'ok' }) + '\n');
  });
  await assert.rejects(service.call(projects[0], 'search_graph', {}, 20), /Timeout/);
  assert.equal(children[0].killed, true);
  assert.equal(children[0].messages.filter(m => m.method === 'tools/call').length, 1);
  fail = false;
  assert.equal(await service.call(projects[0], 'search_graph', {}), 'ok');
  assert.equal(children.length, 2);
});

test('pipe and process failures reject pending calls immediately', async t => {
  for (const event of ['pipe', 'exit', 'error']) {
    const { service, projects } = setup(t, (child, message) => {
      if (!message.id) return;
      if (event === 'pipe') child.stdin.emit('error', new Error('broken pipe'));
      else if (event === 'error') child.emit('error', new Error('spawn failed'));
      else { child.stderr.write('server failed'); child.emit('exit', 1); }
    });
    await assert.rejects(service.call(projects[0], 'search_graph', {}), /broken pipe|spawn failed|server failed/);
    assert.equal(service.session, null);
  }
});

test('missing optional binary fails before spawning and shutdown rejects future calls', async t => {
  const { service, projects, children } = setup(t);
  service.getBinary = () => null;
  await assert.rejects(service.call(projects[0], 'search_graph', {}), /binaire optionnel manquant/);
  assert.equal(children.length, 0);
  service.close();
  await assert.rejects(service.call(projects[0], 'search_graph', {}), /fermé/);
});

test('idle child is released and initialized again on the next request', async t => {
  const { service, projects, children } = setup(t);
  service.idleMs = 10;
  await service.call(projects[0], 'search_graph', {});
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(children[0].killed, true);
  await service.call(projects[0], 'search_graph', {});
  assert.equal(children.length, 2);
});

test('all actual memory IPC handlers forward the requested project', async () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const start = main.indexOf("ipcMain.handle('memory-search'");
  const end = main.indexOf('// ============================================', start);
  const handlers = new Map(), calls = [];
  vm.runInNewContext(main.slice(start, end), {
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    fs: { existsSync: () => true }, path,
    memoryMcpCallTool: async (...args) => { calls.push(args); return {}; },
  });
  for (const handler of handlers.values()) await handler({}, 'requested-project', 'query');
  assert.equal(calls.length, 5);
  assert.ok(calls.every(args => args[0] === 'requested-project'));
});

test('real subprocess transport completes initialization and tool call', async t => {
  const { service, projects } = setup(t);
  const script = `const rl=require('readline').createInterface({input:process.stdin});
    rl.on('line',line=>{const m=JSON.parse(line);if(m.id)process.stdout.write(JSON.stringify({id:m.id,result:{method:m.method,project:process.argv[process.argv.indexOf('--project')+1]}})+'\\n');});`;
  service.spawnProcess = (binary, args, options) => spawn(binary, ['-e', script, '--', ...args], options);
  const result = await service.call(projects[0], 'search_graph', {}, 5000);
  assert.equal(result.method, 'tools/call');
  assert.equal(result.project, fs.realpathSync(projects[0]));
});
