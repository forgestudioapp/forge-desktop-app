const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { syncForgeAgentInstructions, INSTRUCTION_FILE_BY_AGENT } = require('./forge-instructions');

const GUIDES = new Map([
  [4, ['code-structure', 'avant toute modification de code : langage, structure et synchronisation du projet']],
  [5, ['studio-sync', 'synchronisation avec Roblox Studio, Rojo, scripts locaux et bonne place']],
  [6, ['mcp-tools', 'utilisation des outils MCP Forge, sorties compactes et opérations longues']],
  [7, ['delivery-loop', 'boucle de réalisation, corrections itératives et contrôle de finition']],
  [9, ['roblox-architecture', 'avant toute modification de scripts Roblox : architecture client/serveur fiable']],
  [8, ['gameplay', 'gameplay, progression, économie, récompenses']],
  [10, ['persistence-commerce', 'sauvegarde, achats Roblox, reçus et texte utilisateur']],
  [11, ['gui', 'interface, menus, boutons, responsive, accessibilité']],
  [12, ['performance', 'performance, physique, collisions, optimisation du jeu']],
  [13, ['world', 'monde, direction artistique, caméra, effets visuels']],
  [14, ['media', 'images, sons, Blender, modèles 3D, animations, export']],
  [15, ['luau', 'règles Luau, services Roblox, physique, caméra et NPC']],
]);

function buildContextBundle(prompt) {
  const source = String(prompt || '').replace(/\r\n/g, '\n').trim();
  const headings = [...source.matchAll(/^## (\d+)\. .+$/gm)];
  // Unknown layouts retain the complete prompt, including future new sections.
  if (headings.length !== 17 || headings.some((m, i) => Number(m[1]) !== i + 1)) {
    return { core: source, guides: [], full: true };
  }
  const version = crypto.createHash('sha256').update(source).update(fs.readFileSync(path.join(__dirname,'context-query.js'))).digest('hex').slice(0, 16);
  const guides = [];
  const core = [source.slice(0, headings[0].index).trim()];
  headings.forEach((heading, i) => {
    const section = source.slice(heading.index, headings[i + 1]?.index ?? source.length).trim();
    const guide = GUIDES.get(Number(heading[1]));
    if (!guide) core.push(section);
    else if (Number(heading[1]) === 14) {
      const parts = [...section.matchAll(/^### .+$/gm)];
      if (!parts.length) guides.push({ path: `.forge-context/${version}/media.md`, trigger: guide[1], content: section + '\n' });
      else {
        const intro = section.slice(0, parts[0].index).trim();
        guides.push({path:`.forge-context/${version}/media.md`,trigger:'toute création média : règles générales',content:intro+'\n'});
        parts.forEach((part,j)=>guides.push({path:`.forge-context/${version}/media-${j+1}.md`,trigger:part[0].replace(/^### /,''),content:section.slice(part.index,parts[j+1]?.index??section.length).trim()+'\n'}));
      }
    } else guides.push({ path: `.forge-context/${version}/${guide[0]}.md`, trigger: guide[1], content: section + '\n' });
  });

  // Keep user-facing communication rules in the stable prefix, while loading
  // coordination and project-memory recipes only when they can be used.
  const communicationIndex = core.findIndex(part => /^## 17\./m.test(part));
  if (communicationIndex !== -1) {
    const communication = core[communicationIndex];
    const parts = [...communication.matchAll(/^### .+$/gm)];
    if (parts.length) {
      core[communicationIndex] = communication.slice(0, parts[0].index).trim();
      parts.forEach((part, index) => {
        const content = communication.slice(part.index, parts[index + 1]?.index ?? communication.length).trim() + '\n';
        const slug = index === 0 ? 'agent-coordination' : `session-memory-${index}`;
        const trigger = part[0].replace(/^### /, '');
        guides.push({ path: `.forge-context/${version}/${slug}.md`, trigger, content });
      });
    }
  }
  const searchPath = `.forge-context/${version}/search.cjs`;
  guides.push({path:searchPath,trigger:'recherche locale de code : outil exécutable, pas un guide à lire',content:fs.readFileSync(path.join(__dirname,'context-query.js'),'utf8')});
  core.splice(1, 0, [
    '## Guides Forge à consulter selon la tâche',
    'Avant une action dans un domaine ci-dessous, lis le guide correspondant avec tes outils de lecture de fichiers. Lis plusieurs guides si la tâche couvre plusieurs domaines. Ils contiennent les règles de qualité et de livraison Forge. Ne les charge pas tous par défaut.',
    ...guides.map(g => `- ${g.trigger} : \`${g.path}\`.`),
    `Pour chercher un symbole ou chemin sans lire tout l’index : node "${searchPath}" --query "nom" (depuis la racine du projet). Résultat borné, fraîcheur et nextOffset ; --offset permet de continuer. Le programme travaille localement sans appel IA.`,
    'Pour localiser du code, recherche des noms dans `.forge-context/files.ndjson` si ce fichier existe (par exemple avec rg). Cet index local de src/ contient des chemins et des déclarations approximatives, pas le code ni un graphe de dépendances. Vérifie toujours le fichier source et ses instructions locales avant de modifier. L’index peut être incomplet ou en cours de rafraîchissement : une absence de résultat ne prouve pas une absence de fonctionnalité. Évite de lire tout l’index.',
  ].join('\n\n'));
  const startupCore = core.join('\n\n');
  return {
    core: startupCore,
    guides,
    full: false,
    prefixHash: crypto.createHash('sha256').update(startupCore).digest('hex'),
  };
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
  const source = String(prompt || '').replace(/\r\n/g, '\n').trim();
  const bundle = buildContextBundle(source);
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
    return { ...syncForgeAgentInstructions(projectPath, agentType, source), full: true, fallbackReason: err.message };
  }
  return { ...syncForgeAgentInstructions(projectPath, agentType, bundle.core), full: bundle.full,
    originalBytes: Buffer.byteLength(source), startupBytes: Buffer.byteLength(bundle.core), guideCount: bundle.guides.length,
    prefixHash: bundle.prefixHash || null };
}

module.exports = { buildContextBundle, syncForgeContext, ensureContextDirectory };
