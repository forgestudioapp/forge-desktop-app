# Couleurs FBX et insertion Studio — 12 septembre 2026

Le fichier utilisateur mochi-monster.blend a été inspecté sans être modifié. Son script regroupait plusieurs matériaux unis sur les meshes Body, LeftFoot, RightFoot et Tail ; les couleurs n'étaient pas des textures images. Le corps utilisait sept couleurs.

## Corrections

`blender_export_fbx` prépare désormais, dans son processus d'export temporaire, une palette PNG et un matériau par mesh pour les matériaux opaques simples. Les UV de chaque face pointent au centre de sa couleur. Les couleurs linéaires des entrées Principled sont encodées en sRGB pour le PNG ; les cartes de rugosité/métallicité restent des données non couleur. Les images sont intégrées au FBX avec COPY et embed_textures.

Le .blend source, les couleurs de travail et ses UV sont conservés sur disque. Les matériaux texturés/procéduraux, transparents, émissifs ou utilisant les effets avancés exclus sont ignorés par cette préparation ; ils sont listés dans colorPreparation.skipped et nécessitent un traitement adapté. Ce n'est pas un bake universel. Le contrôle de plus de 64 entrées de palette par mesh est également laissé à l'agent.

L'outil insert_asset existait déjà : le délai du pont est passé de 5 à 45 secondes pour cet appel uniquement. Les refus du plugin deviennent des erreurs MCP. Les instructions précisent de suivre l'envoi, récupérer l'assetId et utiliser insert_asset avant de recourir à l'importeur piloté à la souris ; après un timeout, vérifier les objets existants avant toute nouvelle tentative.

Le prompt renforce le travail de silhouette, raccords, cornes/griffes, expression et inspection sous plusieurs angles. Il demande de vérifier le FBX réimporté et d'utiliser le véritable outil d'export. Aucun template n'est ajouté. La géométrie du monstre existant n'a pas été redessinée par cette correction du pipeline.

## Tests réels

- Réexport du monstre vers `tools/forge-colors-o0h519/mochi-monster.fbx`, puis réimport dans Blender : quatre meshes, chacun avec un seul matériau, des UV et une image couleur chargée.
- Palette : 7 couleurs pour Body, 2 pour chaque pied, 1 pour Tail. Comparaison des pixels sRGB décodés avec les couleurs linéaires sources : erreur maximale 0,002885 sur une échelle 0–1, compatible avec la quantification PNG 8 bits.
- Source .blend comparée octet par octet : inchangée.
- Fixture de matériaux dans `tools/forge-material-cases-BIgy3S` : le matériau uni est converti, les matériaux procédural, transparent et émissif sont ignorés ; source inchangée.
- Compilation TypeScript et tests automatisés du pont et des instructions effectués. Le rapport des matériaux et les résultats de réimport sont conservés dans les dossiers de test.

Le pont Studio a expiré à nouveau pendant sa vérification. Aucun nouvel asset n'a été publié et aucune insertion dans la place n'est donc déclarée réussie. Les couleurs sont vérifiées après réimport FBX dans Blender ; leur import final via Roblox et le remplacement du monstre restent à tester avec le pont connecté et le bon propriétaire autorisé.

Sources : [textures et matériau unique Roblox](https://create.roblox.com/docs/art/modeling/texture-specifications), [export de textures intégrées](https://create.roblox.com/docs/art/characters/creating/export-textures).
