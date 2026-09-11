# Envoi des modèles Blender vers Roblox

Le test utilisateur montrait un FBX livré mais un remplacement en jeu bloqué. L'audit du code a trouvé trois défauts dans `forge_upload_fbx_to_roblox` : entrée URL uniquement, clé API obligatoire malgré la connexion OAuth existante, propriétaire utilisateur fixé dans le code. Le suivi d'opération ignorait aussi les erreurs HTTP et les échecs d'import.

Corrections locales :

- `filePath` absolu accepte le FBX exporté par Blender ; `fbxUrl` HTTPS reste compatible. Les deux entrées simultanées sont refusées.
- Lecture bornée à 20 Mio, contrôle du fichier vide, de l'en-tête FBX et des changements pendant la lecture. Ce précontrôle ne remplace pas la validation du modèle par Roblox.
- OAuth du compte connecté réutilisé pour l'envoi et le suivi. Le propriétaire personnel par défaut vient de `userinfo.sub`. Un groupe peut être explicitement choisi avec `creator.groupId`.
- Le secours par clé API requiert un propriétaire explicite. Aucun identifiant utilisateur n'est fixé dans ce parcours.
- Les échecs sont des erreurs MCP ; les succès d'envoi retournent un `operationId`. Le suivi distingue attente, réussite et erreur, sans refaire l'envoi. Une réponse de création sans identifiant de suivi est annoncée comme incertaine, pour éviter les doublons.
- Les instructions Forge distinguent publication de l'asset, insertion dans Studio et remplacement de l'ancien objet.

Validation : compilation réussie, 63 tests MCP réussis, 10 tests ciblés des instructions de l'app réussis. Le lecteur compilé a lu un véritable FBX Blender de 32 380 octets issu d'un précédent test. Les requêtes d'envoi des tests sont simulées : aucun asset utilisateur n'a été publié et le monstre de la capture n'a pas été remplacé. Un essai d'envoi réel reste nécessaire avec le compte autorisé et le pont redémarré sur ce code. Les scopes asset:read/asset:write sont déjà demandés par Forge ; les droits réellement consentis ou les droits sur un groupe peuvent encore bloquer l'opération.

Référence : [API Assets Roblox, fichiers FBX et OAuth](https://create.roblox.com/docs/cloud/guides/usage-assets).
