const fs = require('node:fs');
const path = require('node:path');

const EXAMPLES = Object.freeze({
  object: {
    title: 'Petit objet',
    files: {
      'README.md': `# Premier résultat — petit objet\n\nCe dossier est isolé : Forge ne l’envoie pas automatiquement dans Studio.\n\n1. Ouvre \`object-spec.lua\`.\n2. Vérifie que le nom, la taille, la couleur et le matériau correspondent au résultat attendu ci-dessous.\n3. Demande à un agent de créer cet objet dans la place liée, puis vérifie-le dans Studio.\n\n## Résultat attendu\n\nUn bloc bleu nommé \`ForgeFirstBlock\`, ancré, de taille 4 × 1 × 4.\n`,
      'object-spec.lua': `return {\n  className = "Part",\n  name = "ForgeFirstBlock",\n  size = Vector3.new(4, 1, 4),\n  color = Color3.fromRGB(59, 130, 246),\n  material = Enum.Material.SmoothPlastic,\n  anchored = true,\n}\n`,
    },
  },
  interface: {
    title: 'Interface simple',
    files: {
      'README.md': `# Premier résultat — interface simple\n\nCe dossier est isolé : Forge ne l’envoie pas automatiquement dans Studio.\n\n1. Ouvre \`welcome.client.lua\`.\n2. Demande à un agent de placer ce script dans \`StarterPlayerScripts\` ou de reproduire l’interface dans la place liée.\n3. Lance un playtest et vérifie qu’une carte « Bienvenue dans Forge » apparaît au centre.\n`,
      'welcome.client.lua': `local Players = game:GetService("Players")\nlocal playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")\nlocal gui = Instance.new("ScreenGui")\ngui.Name = "ForgeFirstInterface"\ngui.ResetOnSpawn = false\ngui.Parent = playerGui\n\nlocal card = Instance.new("TextLabel")\ncard.Name = "WelcomeCard"\ncard.AnchorPoint = Vector2.new(0.5, 0.5)\ncard.Position = UDim2.fromScale(0.5, 0.5)\ncard.Size = UDim2.fromOffset(360, 96)\ncard.BackgroundColor3 = Color3.fromRGB(24, 30, 40)\ncard.TextColor3 = Color3.fromRGB(240, 244, 250)\ncard.TextScaled = true\ncard.Text = "Bienvenue dans Forge"\ncard.Parent = gui\n`,
    },
  },
  script: {
    title: 'Modification de script',
    files: {
      'README.md': `# Premier résultat — modification de script\n\nCe dossier est isolé : aucun script du projet n’est remplacé automatiquement.\n\n1. Compare \`before.lua\` et \`after.lua\`.\n2. Vérifie que la nouvelle version refuse les récompenses nulles ou négatives.\n3. Demande à un agent d’appliquer la même modification au script choisi, puis lance le test ciblé.\n`,
      'before.lua': `local function addCoins(balance, amount)\n  return balance + amount\nend\n\nreturn addCoins\n`,
      'after.lua': `local function addCoins(balance, amount)\n  assert(type(balance) == "number", "balance must be a number")\n  assert(type(amount) == "number" and amount > 0, "amount must be positive")\n  return balance + amount\nend\n\nreturn addCoins\n`,
      'verify.lua': `local addCoins = require(script.Parent.after)\nassert(addCoins(10, 5) == 15)\nassert(not pcall(addCoins, 10, 0))\nprint("[Forge] Exemple de modification validé")\n`,
    },
  },
});

function writeStarterExample(projectPath, exampleId) {
  if (!exampleId) return { created: false, exampleId: null, files: [] };
  const example = EXAMPLES[exampleId];
  if (!example) throw new Error('Exemple de démarrage inconnu.');
  const root = path.join(projectPath, '.forge-examples', exampleId);
  fs.mkdirSync(root, { recursive: true });
  const files = [];
  for (const [name, content] of Object.entries(example.files)) {
    const target = path.join(root, name);
    fs.writeFileSync(target, content, { encoding: 'utf8', flag: 'wx' });
    files.push(path.relative(projectPath, target).replace(/\\/g, '/'));
  }
  return { created: true, exampleId, title: example.title, files };
}

module.exports = { EXAMPLES, writeStarterExample };
