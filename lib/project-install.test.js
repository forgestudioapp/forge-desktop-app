const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const code = main.slice(main.indexOf('async function prepareNewTypeScriptProject('), main.indexOf("ipcMain.handle('create-project'", main.indexOf('async function prepareNewTypeScriptProject(')));
function prepareWith({ installCode, output = '', compileResult }) {
  let compiled = 0;
  const sandbox = {
    spawn(command, args) {
      assert.equal(command, 'npm');
      assert.ok(args.includes('--prefer-offline'));
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter(); proc.stderr = new EventEmitter();
      queueMicrotask(() => { if (output) proc.stderr.emit('data', output); proc.emit('close', installCode); });
      return proc;
    },
    compileTypeScript: async () => { compiled++; return compileResult; },
    Date,
  };
  vm.createContext(sandbox); vm.runInContext(code, sandbox);
  return { prepare: sandbox.prepareNewTypeScriptProject, compiled: () => compiled };
}
test('dependency installation succeeds before first TypeScript compilation', async () => {
  const testCase = prepareWith({ installCode: 0, compileResult: { success: true } });
  const result = await testCase.prepare('/temporary-project');
  assert.equal(result.status, 'compiled');
  assert.equal(result.firstSync, 'waiting-place');
  assert.equal(testCase.compiled(), 1);
});
test('offline missing dependency is reported without claiming the project is ready', async () => {
  const testCase = prepareWith({ installCode: 1, output: 'EAI_AGAIN offline', compileResult: { success: true } });
  const result = await testCase.prepare('/temporary-project');
  assert.equal(result.status, 'error');
  assert.equal(result.stage, 'dependencies');
  assert.match(result.error, /EAI_AGAIN/);
  assert.equal(testCase.compiled(), 0);
});
test('interrupted dependency installation remains retryable', async () => {
  const interrupted = prepareWith({ installCode: null, output: 'process interrupted', compileResult: { success: true } });
  const result = await interrupted.prepare('/temporary-project');
  assert.equal(result.status, 'error');
  assert.equal(result.stage, 'dependencies');
  assert.equal(interrupted.compiled(), 0);
  const retried = prepareWith({ installCode: 0, compileResult: { success: true } });
  assert.equal((await retried.prepare('/temporary-project')).status, 'compiled');
});
test('TypeScript compiler error is returned with its diagnostic', async () => {
  const testCase = prepareWith({ installCode: 0, compileResult: { success: false, error: 'src/main.server.ts(3,2): TS1234' } });
  const result = await testCase.prepare('/temporary-project');
  assert.equal(result.status, 'error');
  assert.equal(result.stage, 'compile');
  assert.match(result.error, /main\.server\.ts/);
});
