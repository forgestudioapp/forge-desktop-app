# Validation de l'évolution UX

## Exécuté

- `npm test` : **408 tests réussis, 0 échec**. La suite couvre la création, Studio fermé, une place changée ou incorrecte, la compilation réussie ou cassée, la validation et la publication d'assets, les playtests via leurs appels protégés, et la sauvegarde préalable à une restauration.
- Scripts intégrés de `projects.html`, `workspace.html` et `assets-page.html` : analyse syntaxique JavaScript réussie.
- Captures Electron avec profil temporaire et projets fictifs : accueil, création, espace de travail et assets à **1280 × 720**; accueil et espace de travail avec viewport CSS **1920 × 1080**. `scrollWidth` et `scrollHeight` n'excèdent pas ces dimensions. Le poste de capture ne permet pas une fenêtre native de 1920 pixels; le second viewport est obtenu par zoom Electron.
- Parcours Electron automatisé avec réponses Studio simulées : saisie du nom → espace de travail → message « ouvre Studio » → détection de la place → confirmation unique → première synchronisation confirmée. Réussi, sans toucher à Studio réel.
- Contrôle visuel des captures : actions principales, textes, navigation et cartes visibles; aucun texte principal coupé. Les liens, boutons, filtres, cartes et résumés possèdent un accès clavier ou une prise de focus visible. Le bouton principal de création a un contraste calculé de **5,07:1** entre son texte et son fond; les couleurs bleu/noir sont conservées. Un parcours Tab complet reste à observer dans l'application réelle.

## Parcours vérifiés par tests automatisés

| Scénario | Résultat | Portée |
| --- | --- | --- |
| Création avec le nom seul | Réussi | Contrat de la page et préparation automatique |
| Studio fermé puis détecté | Réussi | Simulation du connecteur; aucune liaison tant que Studio est fermé |
| Place détectée et confirmation | Réussi | Une confirmation; PlaceId revérifié lors de la liaison |
| Mauvaise place ouverte | Réussi | Synchronisation bloquée avant toute écriture |
| Compilation valide puis cassée | Réussi | Lot validé ou bloqué; retour au lot après correction |
| Asset accepté puis publié | Réussi | Publication impossible avant validation; historique conservé |
| Playtest | Réussi | Contrat des appels et rapport; session Roblox réelle non lancée |
| Restauration | Réussi | Plan, fichiers conservés et sauvegarde de retour |

## À compléter sur une session Studio dédiée

Les captures utilisent des données fictives et les scénarios ci-dessus n'ont pas été rejoués de bout en bout avec une session Roblox Studio réelle. Le Studio actuellement ouvert sur ce poste était `test de la forge 8`; il n'a pas été fermé ni modifié par cette validation. Il reste à faire dans le profil de test : fermer puis rouvrir Studio, créer un projet temporaire, confirmer la place, casser puis réparer une compilation, valider un asset, lancer un playtest, restaurer un point et ouvrir une mauvaise place. Aucun fichier du projet Tower Defense n'a été touché.

## Captures

- `ux-captures/accueil-1280x720.png`, `ux-captures/accueil-1920x1080.png`
- `ux-captures/creation-1280x720.png`
- `ux-captures/projet-1280x720.png`, `ux-captures/projet-1920x1080.png`
- `ux-captures/assets-1280x720.png`

## Décisions restantes

- Le terminal de l'agent porte encore la réponse complète des fournisseurs. Un rendu de conversation qui masque les commandes tout en préservant leurs invites interactives demande un format d'événements fiable pour chaque fournisseur. Le terminal reste accessible dans l'espace Agent tant que ce rendu n'existe pas.
- Le catalogue d'assets permet encore de choisir l'insertion lors de la publication. La règle automatique doit être fixée selon la disponibilité de Studio et la nature de l'asset.
