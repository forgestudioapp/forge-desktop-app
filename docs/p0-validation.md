# Validation P0 Forge

Ce document sépare les contrôles techniques locaux des parcours qui doivent être exécutés avec une vraie installation, un vrai compte ou un autre utilisateur. Un test automatisé ne ferme jamais à lui seul un P0 marqué `[V]`.

## Commandes reproductibles

```powershell
npm test
npm run validate:p0:windows
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-install-quick.ps1 -SkipInstall -SkipRoblox -SkipBuild
```

Dans `robloxstudio-mcp` :

```powershell
npm test -- --runInBand
npm run build
```

`validate:p0:windows` contrôle le vrai dossier `dist/win-unpacked`, l'installateur de la version courante, le plugin, le MCP, `node-pty`, les runtimes privés Node/Python et le démarrage de l'exécutable. Son rapport est écrit dans `dist/packaged-windows-smoke-<version>.json`.

## Résultat du 20 octobre 2026

- 324 tests Forge réussis.
- 124 tests MCP réussis et TypeScript compilé.
- Node privé `v24.20.0` et Python privé `3.13.15` exécutés sans Node/Python système.
- Export FBX Blender, présence du plugin et démarrage du MCP réussis dans un profil temporaire.
- `win-unpacked` a été reconstruit avec les corrections. La régénération NSIS du nouvel installateur est bloquée lorsqu'elle doit exécuter son bootstrap non signé ; l'ancien candidat 1.6.0 valide a été restauré pour ne pas laisser un faux installateur incomplet.
- Blocage réel : Windows signale « Une stratégie de contrôle d'application a bloqué ce fichier » pour `dist/win-unpacked/Forge.exe`. L'exécutable et l'installateur sont actuellement `NotSigned`. P0-01 et P0-03 restent donc ouverts jusqu'à signature avec un certificat de confiance et essai sur un autre PC.
- Tentative de lecture Studio : refusée car le contexte de projet Forge n'était pas ouvert. Aucune modification n'a été faite dans une mauvaise place.
- Codex CLI `0.153.2` est connecté via ChatGPT. Claude Code `2.1.251` est installé mais `claude auth status` indique `loggedIn: false`, donc P0-02 ne peut pas être déclaré réussi.

## Protections ajoutées

- Avant le premier démarrage d'une nouvelle version, Forge copie projets enregistrés, préférences, sessions protégées, clés protégées, brouillons et états d'agents dans `update-snapshots`, avec taille et SHA-256. Trois sauvegardes sont conservées.
- Une sauvegarde altérée est refusée avant restauration.
- Si `take_screenshot` est indisponible ou refusé, l'outil MCP `read_screenshot_file` accepte un PNG/JPEG absolu explicitement choisi par l'utilisateur, limité à 2 Mio. Il indique clairement qu'il s'agit d'une image manuelle dont la date et le viewport ne sont pas prouvés.

## Preuves encore obligatoires

1. Signer le bootstrap, l'installateur et l'exécutable Windows avec un certificat de confiance, puis reconstruire le candidat 1.6.0 contenant les dernières corrections.
2. Installer sur un second PC Windows sans Node, Python, Codex ni Claude préinstallés.
3. Depuis le raccourci installé, connecter Codex puis Claude, ouvrir un projet lié, lire la place, créer un objet témoin et le supprimer, redémarrer et vérifier la reprise.
4. Effectuer le parcours compte/licence/achat avec comptes et clé de test autorisés.
5. Mettre à niveau une vraie installation ancienne, provoquer un échec contrôlé, réinstaller la version connue et comparer les données.
6. Tester capture native et capture manuelle sur une place liée.
7. Importer le FBX de contrôle dans une place vierge et inspecter matériau, échelle, axes, pivot, hiérarchie, collisions et animation.
8. Exécuter une génération distante avec petit budget, fermer Forge, reprendre avec le même identifiant et vérifier l'absence de seconde facturation.
9. Observer 3 à 5 nouveaux utilisateurs avec chronométrage et journal des blocages.
