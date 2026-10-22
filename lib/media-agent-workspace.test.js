'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMediaAgentWorkspace, removeMediaAgentWorkspace } = require('./media-agent-workspace');

test('creates and removes an isolated media workspace only below its dedicated root', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-media-agent-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const base = path.join(temp, 'runs');
  const task = createMediaAgentWorkspace(base, 'codex_123');
  assert.equal(path.dirname(task), fs.realpathSync(base));
  fs.writeFileSync(path.join(task, 'temporary.txt'), 'temporary');
  assert.equal(removeMediaAgentWorkspace(base, task), true);
  assert.equal(fs.existsSync(task), false);
  assert.equal(removeMediaAgentWorkspace(base, temp), false);
  assert.equal(fs.existsSync(temp), true);
});
