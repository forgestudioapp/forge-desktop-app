const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { syncForgeAgentInstructions, INSTRUCTION_FILE_BY_AGENT } = require('./forge-instructions');

const GUIDES = new Map([
  [8, ['gameplay', 'gameplay, progression, économie, récompenses']],
  [11, ['gui', 'interface, menus, boutons, responsive, accessibilité']],
  [12, ['performance', 'performance, physique, collisions, optimisation du jeu']],
  [13, ['world', 'monde, direction artistique, caméra, effets visuels']],
  [14, ['media', 'images, sons, Blender, modèles 3D, animations, export']],
]);

function buildContextBundle(prompt) {
  const source = String(prompt || '').replace(/\r\n/g, '\n').trim();
  const headings = [...source.matchAll(/^## (\d+)\. .+$/gm)];
  // Unknown layouts retain the complete prompt, including future new sections.
  if (headings.length !== 17 || headings.some((m, i) => Number(m[1]) !== i + 1)) {
    return { core: source, guides: [], full: true };
  }
  const version = crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
  const guides = [];
  const core = [source.slice(0, headings[0].index).trim()];
  headings.forEach((heading, i) => {
    const section = source.slice(heading.index, headings[i + 1]?.index ?? source.length).trim();
    const guide = GUIDES.get(Number(heading[1]));
    if (!guide) core.push(section);
    else guides.push({ path: `.forge-context/${version}/${guide[0]}.md`, trigger: guide[1], content: section + '\n' });
  });
  core.splice(1, 0, [
    '## Guides Forge à consulter selon la tâche',
    'Avant une action dans un domaine ci-dessous, lis le guide correspondant avec tes outils de lecture de fichiers. Lis plusieurs guides si la tâche couvre plusieurs domaines. Ils contiennent les règles de qualité et de livraison Forge. Ne les charge pas tous par défaut.',
    ...guides.map(g => `- ${g.trigger} : \`${g.path}\`.`),
    'Pour localiser du code, recherche des noms dans `.forge-context/files.ndjson` si ce fichier existe (par exemple avec rg). Cet index local de src/ contient des chemins et des déclarations approximatives, pas le code ni un graphe de dépendances. Vérifie toujours le fichier source et ses instructions locales avant de modifier. L’index peut être incomplet ou en cours de rafraîchissement : une absence de résultat ne prouve pas une absence de fonctionnalité. Évite de lire tout l’index.',
  ].join('\n\n'));
  return { core: core.join('\n\n'), guides, full: false };
}

function ensureContextDirectory(projectPath, relative = '.forge-context') {
  let target = projectPath;
  for (const part of relative.split('/')) {
    target = path.join(target, part);
    try { fs.mkdirSync(target); } catch (err) { if (err.code !== 'EEXIST') throw err; }
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Dossier de contexte non sûr.');
  }
  return target;
}

function syncForgeContext(projectPath, agentType, prompt) {
  if (!INSTRUCTION_FILE_BY_AGENT[agentType]) return { skipped: true, reason: 'agent-unsupported' };
  const bundle = buildContextBundle(prompt);
  try {
    for (const guide of bundle.guides) {
      ensureContextDirectory(projectPath, path.posix.dirname(guide.path));
      const target = path.join(projectPath, guide.path);
      try { fs.writeFileSync(target, guide.content, { encoding: 'utf8', flag: 'wx' }); }
      catch (err) {
        if (err.code !== 'EEXIST') throw err;
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isFile() || fs.readFileSync(target, 'utf8') !== guide.content) {
          throw new Error('Guide existant modifié ou non sûr; fichier préservé.');
        }
      }
    }
  } catch (err) {
    return { ...syncForgeAgentInstructions(projectPath, agentType, prompt), full: true, fallbackReason: err.message };
  }
  return { ...syncForgeAgentInstructions(projectPath, agentType, bundle.core), full: bundle.full,
    originalBytes: Buffer.byteLength(prompt), startupBytes: Buffer.byteLength(bundle.core), guideCount: bundle.guides.length };
}

module.exports = { buildContextBundle, syncForgeContext, ensureContextDirectory };
