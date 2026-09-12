# Vérification automatique du FBX avant livraison

L'exporteur FBX valide la scène, prépare les couleurs puis écrit dans un
sous-dossier temporaire non surveillé. Il réimporte ce fichier dans une scène
d'inspection et compare les noms des meshes et leurs bornes mondiales statiques.
Une pièce manquante ou déplacée provoque une erreur. Le fichier final n'est
remplacé qu'après succès, avec os.replace sur le même volume. Le .blend source
n'est pas sauvegardé pendant cette opération.

Le résultat contient exportVerification : meshes importés, nombre de bornes
contrôlées, erreur maximale, problèmes et skippedBounds. Les meshes animés,
contraints, avec shape keys ou armature demandent encore un contrôle de pose et
d'animation. Les éventuels meshes supplémentaires sont signalés (des courbes
peuvent être converties par FBX). Ce contrôle ne juge ni la qualité artistique,
ni les couleurs, ni l'import alternatif par EditableMesh dans Roblox. Les
contrôles visuels et en jeu restent nécessaires.

Vérification réelle avec Blender, septembre 2026 :

- Six meshes séparés avec parent commun, translations, rotations et échelles
  non uniformes : noms et hiérarchie préservés au réimport, erreur maximale des
  sommets de 0.00000147 unité.
- Déplacement volontaire d'un mesh après validation : export refusé et FBX
  précédent inchangé.
- Omission volontaire d'un mesh : export refusé et FBX précédent inchangé.
- Animation sur un mesh : cinq meshes statiques contrôlés, le sixième signalé
  explicitement dans skippedBounds.
- Nimbo réel : quatre meshes, UV et textures de palette présents après export
  et réimport ; rendu inspecté et .blend source inchangé.
- Compilation TypeScript, cinq tests Blender/HTTP et sept tests de transmission
  des consignes Forge réussis.

Scripts reproductibles dans robloxstudio-mcp/scripts :
smoke-fbx-separation.mjs et smoke-fbx-colors.mjs.
Rapport de séparation : tools/forge-separated-voDB3N/verification.json.
Rapport couleurs : tools/forge-colors-q6mqFc/verification.json.

Les modifications sont locales ; aucune release ni publication Roblox n'a été
effectuée pour cette amélioration.
