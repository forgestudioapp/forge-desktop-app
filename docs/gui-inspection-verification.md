# Vérification GUI — 11 septembre 2026

Deux outils ont été ajoutés au catalogue MCP et au dispatch partagé du pont Studio :

- `inspect_gui` mesure les objets GUI actuellement rendus dans PlayerGui (par défaut), ou une branche précise de PlayerGui/CoreGui. Il signale les textes qui ne tiennent pas, les débordements, les découpages par un parent et les superpositions possibles entre boutons frères.
- `take_screenshot` utilise StudioCaptureService et renvoie un contenu image MCP PNG, limité à 1280 pixels sur le grand côté et 2 Mio. La capture inclut l'UI. Aucun service de génération payant n'est appelé.

Le diagnostic est borné : 500 objets GUI, 2 000 instances visitées, 100 problèmes retournés, 10 000 comparaisons de boutons. Les résultats tronqués sont annoncés. Les branches masquées, la géométrie tournée et les descendants des zones défilantes sont traités prudemment pour limiter les faux positifs. Une superposition reste un indice à examiner, pas une demande de correction automatique. Les tailles proviennent de la fenêtre actuelle : aucune validation mobile ou des interactions n'est déduite.

Les objets stockés dans StarterGui sont refusés comme source de mesures rendues. L'absence de PlayerGui produit une erreur explicite. Aucun GUI de projet n'est réécrit par ces outils. Aucun template n'est ajouté ; les règles des deux Toolboxes sont conservées.

La capture vérifie d'abord sa disponibilité. `requestPermission: true` permet de demander l'autorisation native de Roblox ; un refus est retourné à l'agent. La capture attend son encodage et libère son objet temporaire, même en cas d'erreur. Le délai du pont est de 30 secondes pour la capture, 45 secondes avec demande native, au lieu des 5 secondes ordinaires ; le nettoyage des requêtes respecte ce délai particulier. Ces délais restent sous celui du proxy HTTP (60 secondes).

Les instructions GUI de Forge demandent désormais un diagnostic ciblé, une capture lorsque disponible, puis une correction locale et une nouvelle vérification. Elles interdisent de présenter une taille d'écran non observée comme testée.

## Vérifications effectuées

- Compilation TypeScript : réussie.
- Pont MCP : 57 tests réussis, dont huit tests nouveaux (diagnostic, exclusions, limites, erreurs, contenu image, dispatch et expiration particulière des captures).
- Application : 92 tests réussis, dont conservation et distribution des instructions.
- `git diff --check` : aucune erreur ; avertissements de conversion LF/CRLF uniquement.
- Dans Studio, les scripts ont effectivement retourné l'absence de PlayerGui rendu et l'indisponibilité de capture. L'existence de StudioCaptureService a été confirmée. `CanCaptureScreenshot() == false` ne permet pas de distinguer à lui seul une permission manquante d'un DataModel inactif.

## Limites de validation réelle

Le test suivant sur un ScreenGui temporaire dans CoreGui a rencontré une expiration du pont, puis la vérification de connexion/nettoyage a elle aussi expiré. Ce test n'est donc pas compté comme réussi. Le script prévoyait la destruction de son seul objet temporaire après le test, y compris en cas d'erreur ; aucune modification d'un GUI utilisateur ou sauvegarde de place n'a été demandée. Une capture PNG réelle, les mesures de cette fixture et les tailles mobile/tablette restent à vérifier avec Studio connecté et la capture autorisée. Les tests unitaires de contenu image ne prouvent pas la réussite du moteur de capture Roblox.

Les sources compilées du MCP ont été mises à jour localement. Un pont déjà démarré garde son ancien catalogue jusqu'à son redémarrage. Aucune publication ni installation de nouvelle version n'a été effectuée.

## Références API

- [StudioCaptureService](https://create.roblox.com/docs/reference/engine/classes/StudioCaptureService)
- [StudioScreenshotCapture](https://create.roblox.com/docs/reference/engine/classes/StudioScreenshotCapture)
