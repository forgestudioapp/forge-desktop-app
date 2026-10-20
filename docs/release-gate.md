# Barrière de livraison Forge

Une publication GitHub ne démarre que si les deux plateformes passent les contrôles locaux et produisent un installateur vérifiable.

## Avant l’emballage

`npm run release:gate` vérifie :

- la cohérence des versions `package.json` et `package-lock.json` ;
- tous les fichiers et ressources déclarés pour l’emballage ;
- la présence des runtimes privés Node et Python ;
- la correspondance de version entre le plugin Forge et le serveur MCP ;
- la syntaxe Electron et preload ;
- tous les tests Forge, les tests MCP et l’intégrité du runtime Python.

Une seule erreur rend la commande non nulle et bloque la livraison.

## Après l’emballage

La commande suivante refuse un dossier sans installateur et écrit la taille et la somme SHA-256 de chaque `.exe`, `.dmg` ou `.zip` :

```powershell
node scripts/release-gate.cjs --skip-tests --artifacts dist --manifest dist/release-checksums.json
```

Le workflow GitHub construit Windows et macOS sans publier, vérifie les installateurs, puis déclenche un travail de publication séparé uniquement si les deux constructions ont réussi. Les manifestes de sommes sont joints à la release.
