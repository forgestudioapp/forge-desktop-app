# Kit GUI et validation Blender — 10 septembre 2026

**Rectification après demande de l'utilisateur : le kit GUI décrit dans l'historique ci-dessous a été retiré des sources et de l'installation des guides. Forge interdit les templates GUI ; la Toolbox reste le moyen prévu pour réutiliser les assets. Les règles générales de qualité GUI et les contrôles Blender sont conservés. Les anciens fichiers de contexte éventuellement présents dans les projets ne sont plus référencés et les nouvelles instructions interdisent leur utilisation.**

## Kit GUI

Le guide GUI installé pour Codex, Claude et Antigravity pointe vers un kit Luau versionné avec le prompt dans `.forge-context`. Le kit est un point de départ pour les projets Luau ; pour les projets TypeScript/roblox-ts, le guide demande de conserver le framework et la compilation existants. Il n'installe pas automatiquement des scripts dans le jeu.

Le module fournit un bouton avec états normal, désactivé, chargement, succès et erreur, garde contre les doubles activations, survol/focus centré, nettoyage à la destruction et palette paramétrable. La fenêtre fournit un titre, un bouton de fermeture et un corps défilant ordonné. Ce premier kit n'est pas un gestionnaire de modales, une bibliothèque React ou un système de jeu complet.

Le fichier `scripts/test-gui-kit.luau` a été exécuté avec le module réel dans Roblox Studio. Six groupes de contrôles passent : contraintes et défilement, états et réentrance, échec avec possibilité de réessayer, destruction pendant une action, fermeture et restauration du libellé, destruction du parent. Toutes les instances étaient détachées de la place et ont été détruites. Le warning d'erreur était volontaire. Le test a notamment conduit à corriger la garde immédiate après destruction et le rétablissement du libellé après succès.

La connexion utilise [GuiButton.Activated](https://create.roblox.com/docs/reference/engine/classes/GuiButton) et le survol utilise [UIScale](https://create.roblox.com/docs/reference/engine/classes/UIScale). Les entrées physiques souris/manette/tactile et le rendu sur écrans réels restent à tester en playtest avec le GUI final du jeu ; les contrôles automatisés ne prouvent pas sa qualité visuelle.

## Blender

Le nouvel outil `blender_validate` inspecte les meshes évalués avec leurs modificateurs : triangles, dimensions des sommets en coordonnées mondiales, matériaux absents, textures image manquantes, UV absents, échelles non appliquées et transformations miroir. La géométrie évaluée temporaire est libérée après lecture, selon l'[API Blender](https://docs.blender.org/api/5.0/bpy.types.Object.html).

Le nombre de triangles configurable est un budget indicatif par objet. Une texture procédurale sans UV ou une échelle non appliquée peut être intentionnelle : ces points sont des avertissements. La validation ne corrige pas automatiquement les objets et ne prétend pas valider leur esthétique, leur rig ou leurs animations. Les parcours et sorties sont bornés et signalent les troncatures.

Les exports FBX/GLB exécutent ce contrôle avant d'écrire et acceptent `objectNames` pour choisir précisément les objets, armature incluse si nécessaire. Les erreurs bloquantes (par exemple un mesh vide) et un scan incomplet interrompent l'export ; les avertissements sont retournés. L'inspection et les exports ne sauvegardent plus la scène, pour éviter de modifier son état de sélection.

Test réel avec Blender 5.2.1 : `tools/forge-validation-mmRFJT/verification.json`. Le test couvre le comptage après subdivision, les dimensions finies, les avertissements d'échelle, une texture et des UV manquants, un mesh vide bloqué avant export, un objet inconnu refusé et un FBX réimporté avec uniquement l'objet choisi. Comparaison binaire du `.blend` avant/après pour vérifier l'absence de sauvegarde.

Suites automatisées : 81 tests Forge Desktop et 46 tests MCP réussis ; compilation TypeScript réussie. Les tests d'intégration vérifient aussi le routage HTTP du validateur et de la sélection d'export, ainsi que l'installation du kit pour les trois agents et la préservation d'un kit personnalisé.

Aucune génération payante ni publication effectuée dans cette intervention. Les sources et le MCP compilé sont modifiés ; les processus existants doivent charger cette version pour disposer du nouvel outil. L'application installée ne reçoit pas automatiquement ces changements.
