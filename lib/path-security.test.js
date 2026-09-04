const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { isExistingDirectoryWithinRoots } = require('./path-security');

test('allows an existing project below an allowed root', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-path-'));
  const project = path.join(sandbox, 'account', 'test-gpt');
  fs.mkdirSync(project, { recursive: true });

  try {
    assert.equal(isExistingDirectoryWithinRoots(project, [sandbox]), true);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('allows a legacy Documents project when Electron uses redirected Documents', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-path-'));
  const redirectedDocuments = path.join(sandbox, 'OneDrive', 'Documents');
  const legacyDocuments = path.join(sandbox, 'Documents');
  const project = path.join(legacyDocuments, 'ForgeProjects', 'test-gpt');
  fs.mkdirSync(redirectedDocuments, { recursive: true });
  fs.mkdirSync(project, { recursive: true });

  try {
    assert.equal(
      isExistingDirectoryWithinRoots(project, [redirectedDocuments, legacyDocuments]),
      true
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('rejects siblings, missing paths and files', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-path-'));
  const allowedRoot = path.join(sandbox, 'allowed');
  const sibling = path.join(sandbox, 'allowed-copy');
  const file = path.join(allowedRoot, 'file.txt');
  fs.mkdirSync(allowedRoot);
  fs.mkdirSync(sibling);
  fs.writeFileSync(file, 'not a project directory');

  try {
    assert.equal(isExistingDirectoryWithinRoots(sibling, [allowedRoot]), false);
    assert.equal(isExistingDirectoryWithinRoots(path.join(allowedRoot, 'missing'), [allowedRoot]), false);
    assert.equal(isExistingDirectoryWithinRoots(file, [allowedRoot]), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
