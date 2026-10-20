# Matrice de support Forge

Cette matrice sépare ce que le code prépare de ce qui a été essayé sur une vraie machine. Une cible d’empaquetage ne constitue pas, à elle seule, une preuve de compatibilité.

| Plateforme | Architecture | Installation | Terminal Codex / Claude | Plugin Roblox | Médias locaux | Niveau actuel |
|---|---|---|---|---|---|---|
| Windows 10/11 | x64 | NSIS par utilisateur | `node-pty` + runtime Node x64 | `%LOCALAPPDATA%` et `%USERPROFILE%` | Python U²-Net + Blender si installé | Développement et tests automatisés sur Windows ; parcours propre sur un autre PC encore requis |
| macOS 10.15+ | Apple Silicon | DMG + ZIP arm64 | `node-pty` reconstruit sur macOS + runtime Node arm64 | `~/Documents/Roblox/Plugins` | Blender et services distants ; détourage U²-Net indisponible | Construction CI préparée ; signature, notarisation et essai réel Mac encore requis |
| macOS 10.15+ | Intel x64 | DMG + ZIP x64 | `node-pty` reconstruit sur macOS + runtime Node x64 | `~/Documents/Roblox/Plugins` | Blender et services distants ; détourage U²-Net indisponible | Construction CI préparée ; signature, notarisation et essai réel Mac Intel encore requis |
| Linux | — | Aucun paquet | Non qualifié | Non qualifié | Non qualifié | Non supporté |

## Dépendances embarquées ou attendues

- Electron `32.3.3`.
- Node privé par système et architecture, contrôlé avant l’empaquetage.
- `node-pty 1.1.0`, reconstruit pour la version Electron de chaque runner.
- Serveur MCP Roblox, ses dépendances et le plugin portant la même version.
- Runtime Python U²-Net uniquement dans le paquet Windows.
- Roblox Studio, Codex CLI, Claude Code et Blender restent des logiciels externes détectés par Forge.

## Conditions avant d’annoncer une plateforme comme validée

1. Installer le paquet signé sur une machine qui n’a jamais exécuté Forge.
2. Terminer l’accueil, créer et rouvrir un projet.
3. Installer le plugin, lier la bonne place et lire la scène.
4. Lancer au moins Codex ; lancer Claude Code avec un compte de test disponible.
5. Modifier un élément identifiable, vérifier le résultat puis redémarrer Forge.
6. Ouvrir la Toolbox, changer d’onglet et ajouter un agent sans gel.
7. Conserver le nom exact du paquet, la version du système, l’architecture et le rapport de diagnostic.

Les liens du site peuvent être préparés avant ces essais. Ils ne doivent devenir publics qu’après la production d’artefacts signés et le parcours réel correspondant.
