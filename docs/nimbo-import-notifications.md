# Nimbo : origine des meshes et notifications

Vérification du 12 septembre 2026, place 72381296087775, Studio en édition.

## Cause constatée

Le FBX réimporté et son aperçu Blender montrent les pieds raccordés au corps.
Le chemin réellement utilisé dans Studio reconstruit les quatre meshes depuis
`nimbo-monster.mesh.json`, via le script du projet `NimboBuilder.lua`.
Ses sommets sont déjà en coordonnées du modèle. Le script ajoutait ensuite
`mesh:GetCenter()` au CFrame de chaque MeshPart, sans recentrer les sommets.
Les centres lus dans MeshContent confirmaient ce double déplacement : pieds
à (+/-0.5, -1.03, -0.13), queue à (0, 0.09818, 1.10161).
Quatre pièces n'est pas un défaut : elles correspondent ici aux groupes animés.

## Correction et vérification réelle

Le constructeur soustrait maintenant le centre des sommets avant sérialisation,
puis conserve le placement de la pièce à ce centre. GeometryVersion passe à 2.
La source locale a été synchronisée dans Studio. Les huit MeshParts existantes
de Workspace.NimboMonster et ServerStorage.NimboMonster ont été corrigées après
préparation et validation des quatre contenus recentrés.

Les deux modèles originaux sont conservés dans
`ServerStorage.ForgeNimboOriginRepair.BeforeOriginFix`. Une copie du script original
est conservée dans `models/NimboBuilder-before-origin-fix.lua.bak` du projet.

Contrôle des 6878 sommets : erreur maximale de reconstruction inférieure à
0.00000009 unité. Les 13536 faces et les nombres de couleurs sont conservés.
Ce contrôle porte sur l'assemblage, pas sur une nouvelle direction artistique.
La capture Studio est indisponible (CanCaptureScreenshot = false).

## Notifications

Les images contenues dans models/ sont des dépendances du modèle : palettes,
textures et vues QA ne déclenchent ni notification ni publication séparée.
Le PNG `*-preview` continue d'actualiser la vignette existante.
Les images autonomes dans assets/ conservent leur comportement.

Le stockage unifie aussi les notifications de modèle entre watcher, fin de
génération et réexport, au moment de l'écriture. Il conserve l'identifiant,
la date, l'état lu et la vignette ; une arrivée GLB tardive ne remplace pas le FBX.
Les anciens doublons historiques ne sont pas supprimés.

Validation : 104 tests de la suite existante et des nouveaux cas de stockage,
puis un test d'intégration supplémentaire exécutant le vrai watcher avec
palettes, vues QA, FBX, aperçu tardif, réexport et image autonome. Syntaxe main.js
vérifiée. La logique Electron modifiée nécessite le prochain lancement de la
version qui contient ces changements ; aucune release n'a été publiée ici.
