const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const prompt = fs.readFileSync(path.join(__dirname, '..', 'forge-system-prompt.md'), 'utf8');

test('le prompt Forge couvre les quatre niveaux de qualité produit', () => {
  assert.match(prompt, /Fonctionnelle/);
  assert.match(prompt, /Compréhensible/);
  assert.match(prompt, /Cohérente et agréable/);
  assert.match(prompt, /Finie et vérifiée/);
});

test('les interfaces reçoivent des états et un survol qui grandit depuis le centre', () => {
  assert.match(prompt, /augmentation uniforme depuis le centre/);
  assert.match(prompt, /`UIScale`/);
  assert.match(prompt, /état de pression/);
  assert.match(prompt, /états vide[\s\S]*chargement[\s\S]*erreur/);
  assert.doesNotMatch(prompt, /UDim2\.fromOffset/);
});

test('les icones de jeu et les icones d interface restent clairement distinctes', () => {
  assert.match(prompt, /contour noir net autour du sujet principal/);
  assert.match(prompt, /ne forme pas une bordure autour de toute l'image/);
  assert.match(prompt, /N'ajoute \*\*pas\*\* automatiquement de contour.*icône de jeu/);
});

test('le guide de finition couvre tout le parcours de creation Roblox', () => {
  for (const expectation of [
    /Boucle de jeu/,
    /Prise en main et clarté/,
    /Game feel/,
    /Progression, récompenses et économie/,
    /Adaptation aux appareils et accessibilité/,
    /Monde, direction artistique, caméra et effets/,
    /Miniatures et icônes de jeu Roblox/,
    /Sons et ambiance/,
    /Modèles 3D/,
    /Tests, observation et assurance qualité/,
  ]) assert.match(prompt, expectation);
});

test('les miniatures doivent etre uniques, fideles et lisibles', () => {
  assert.match(prompt, /ratio 16:9/);
  assert.match(prompt, /Représente honnêtement le gameplay/);
  assert.match(prompt, /idée visuelle propre au jeu/);
  assert.match(prompt, /affichée très petite/);
});
