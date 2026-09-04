const fs = require('fs');
const path = require('path');

const MANAGED_START = '<!-- FORGE MANAGED INSTRUCTIONS: START -->';
const MANAGED_END = '<!-- FORGE MANAGED INSTRUCTIONS: END -->';
const INSTRUCTION_FILE_BY_AGENT = Object.freeze({
  codex: 'AGENTS.md',
  claude: 'CLAUDE.md',
  antigravity: 'GEMINI.md',
});

function buildManagedBlock(prompt) {
  const body = String(prompt || '').trim();
  if (!body) throw new Error('Le prompt systeme Forge est vide.');
  return `${MANAGED_START}\n${body}\n${MANAGED_END}`;
}

function mergeManagedInstructions(existing, prompt) {
  const current = String(existing || '').replace(/\r\n/g, '\n').trimEnd();
  const block = buildManagedBlock(prompt);
  const start = current.indexOf(MANAGED_START);
  const end = current.indexOf(MANAGED_END);

  if ((start === -1) !== (end === -1) || (start !== -1 && end < start)) {
    throw new Error('Bloc d instructions Forge incomplet; fichier preserve.');
  }

  if (start !== -1) {
    const after = end + MANAGED_END.length;
    return `${current.slice(0, start)}${block}${current.slice(after)}`.trimEnd() + '\n';
  }

  return current ? `${current}\n\n${block}\n` : `${block}\n`;
}

function syncForgeAgentInstructions(projectPath, agentType, prompt) {
  const fileName = INSTRUCTION_FILE_BY_AGENT[agentType];
  if (!fileName) return { skipped: true, reason: 'agent-unsupported' };
  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw new Error('Dossier de projet Forge introuvable.');
  }

  const targetPath = path.join(projectPath, fileName);
  let existing = '';
  if (fs.existsSync(targetPath)) {
    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return { skipped: true, reason: 'unsafe-target', path: targetPath };
    }
    existing = fs.readFileSync(targetPath, 'utf8');
  }

  const next = mergeManagedInstructions(existing, prompt);
  if (next !== existing.replace(/\r\n/g, '\n')) {
    fs.writeFileSync(targetPath, next, 'utf8');
    return { updated: true, path: targetPath };
  }
  return { updated: false, path: targetPath };
}

module.exports = {
  MANAGED_START,
  MANAGED_END,
  INSTRUCTION_FILE_BY_AGENT,
  buildManagedBlock,
  mergeManagedInstructions,
  syncForgeAgentInstructions,
};
