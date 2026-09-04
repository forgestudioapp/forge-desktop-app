const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  MANAGED_START,
  MANAGED_END,
  mergeManagedInstructions,
  syncForgeAgentInstructions,
} = require('./forge-instructions');

test('ajoute les instructions Forge sans effacer les instructions du projet', () => {
  const result = mergeManagedInstructions('# Regles du projet\nToujours utiliser Knit.\n', '# Forge\nAgis.');

  assert.match(result, /Toujours utiliser Knit\./);
  assert.match(result, new RegExp(MANAGED_START));
  assert.match(result, /# Forge\nAgis\./);
  assert.match(result, new RegExp(MANAGED_END));
});

test('remplace uniquement le bloc Forge lors d une mise a jour', () => {
  const initial = mergeManagedInstructions('# Regles du projet', 'ancienne version');
  const updated = mergeManagedInstructions(initial, 'nouvelle version');

  assert.match(updated, /# Regles du projet/);
  assert.doesNotMatch(updated, /ancienne version/);
  assert.equal((updated.match(new RegExp(MANAGED_START, 'g')) || []).length, 1);
  assert.match(updated, /nouvelle version/);
});

test('ecrit le fichier d instructions reconnu par chaque agent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-instructions-'));
  try {
    const codex = syncForgeAgentInstructions(dir, 'codex', 'Prompt Forge');
    const claude = syncForgeAgentInstructions(dir, 'claude', 'Prompt Forge');
    const antigravity = syncForgeAgentInstructions(dir, 'antigravity', 'Prompt Forge');

    assert.equal(path.basename(codex.path), 'AGENTS.md');
    assert.equal(path.basename(claude.path), 'CLAUDE.md');
    assert.equal(path.basename(antigravity.path), 'GEMINI.md');
    assert.equal(fs.readFileSync(codex.path, 'utf8').includes('Prompt Forge'), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
