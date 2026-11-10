# Architecture UX de Forge

## Inventaire de l'existant

| Écran | Responsabilité actuelle | Navigation et actions visibles |
| --- | --- | --- |
| `index.html`, `login.html`, `accounts.html`, `onboarding.html`, `roblox-studio.html` | Entrée, compte et installation de la connexion Studio | Parcours initial, vérifications du plugin et du serveur |
| `projects.html` | Liste et recherche des projets | Nouveau projet, actualiser, paramètres, ouvrir, supprimer |
| `project-create.html`, `project-setup.html` | Création locale | Nom, création automatique, progression; l'ancienne URL redirige |
| `workspace.html` | Travail avec les agents et état du projet | Agents, terminal, assets, médias, places, tests, versions, mémoire, notifications, détails de compilation |
| `assets-page.html`, `thumbnail.html` | Catalogue et production de médias | Aperçu, validation, révision, publication, historique, atelier |
| `project-settings.html`, `settings.html`, `api-keys.html`, `agents.html` | Réglages du projet, préférences et fournisseurs | Connexions, démarrage des agents, diagnostic et paramètres techniques |
| `connexion.html`, `install.html`, `get-license.html` | Écrans historiques ou auxiliaires de connexion et licence | Accessibles selon le parcours; ne doivent pas devenir une seconde navigation principale |
| `privacy.html`, `terms.html` | Informations légales | Liens auxiliaires |

## Problèmes repérés

- La barre de l'espace de travail cumule des destinations, des boutons d'agent, des outils et l'état technique. Le chat n'a pas de point d'entrée évident.
- L'accueil expose le chemin du dossier et le PlaceId, alors que l'utilisateur veut reconnaître et reprendre son jeu. « Nouveau projet » apparaît aussi dans les cartes.
- Les assets ont deux accès (page et toolbox); les médias constituent un troisième accès proche. Les tests et versions sont cachés sous « Outils du projet » alors que les places sont visibles en permanence.
- L'état du projet sait déjà résumer la compilation et la liaison, mais ses libellés et ses erreurs montrent des termes de développeur trop tôt.
- La création ne demande déjà que le nom, mais les erreurs de préparation et la connexion peuvent interrompre le parcours sans indication simple de la prochaine action.
- Les commandes de terminal et les réglages d'agents restent utiles aux utilisateurs avancés, mais ne doivent pas devenir la première décision d'un débutant.

## Navigation cible

L'accueil présente **Créer un jeu**, **Continuer un jeu existant** et les projets récents. Dans un projet, la navigation primaire est **Projet**, **Agent**, **Assets**, **Tests**, **Versions**, **Paramètres**. **Places** apparaît lorsqu'il y a plusieurs places, et reste accessible dans les détails du projet avec une seule place. L'atelier médias, la toolbox, la mémoire et les diagnostics restent accessibles dans leur section concernée. Les écrans de compte et d'installation restent dans le parcours de démarrage.

## Rôle de chaque section

| Section | Action principale | Contenu secondaire |
| --- | --- | --- |
| Projet | Comprendre l'état et résoudre l'action requise | Détails techniques, place liée, réglages du projet, places |
| Agent | Décrire le jeu et suivre la tâche | Autres agents, sessions, terminal, commandes et activité détaillée |
| Assets | Examiner puis accepter ou refaire | Filtres, historique, export, publication validée, atelier médias |
| Tests | Lancer et lire un test | Modes solo, serveur, multijoueur, preuves et logs |
| Versions | Créer ou restaurer un point | Détail des fichiers, sauvegarde préalable et historique |
| Places | Voir la place ouverte, son rôle et l'agent responsable | Liaison et changement de place, uniquement après vérification |
| Paramètres | Régler les préférences utiles | Fournisseurs et diagnostics séparés |

## Déplacements et regroupements

- Le chemin local, le langage, les identifiants Roblox et les versions de compilation passent dans **Voir les détails** de l'état du projet.
- **Toolbox** rejoint Assets; l'atelier médias reste un outil de cette section.
- **Tests** et **Versions** deviennent des destinations nommées, mais conservent leurs panneaux et leurs appels existants.
- **Places** quitte la barre principale tant qu'une seule place est utilisée; ses contrôles existants restent disponibles dans Projet.
- L'ajout d'agents, le choix du fournisseur et le terminal restent dans l'espace Agent, derrière les détails, pour préserver les sessions existantes.
- Les diagnostics des réglages restent accessibles sans se confondre avec les préférences courantes.

## Parcours et garde-fous

1. L'utilisateur crée un jeu avec son nom. Forge choisit et prépare le modèle existant automatiquement.
2. Forge ouvre l'espace de travail. Si Studio est fermé, l'écran indique de l'ouvrir et attend sa détection. La place détectée n'est liée qu'après une confirmation.
3. Une fois la première synchronisation confirmée, le chat affiche l'invitation à décrire le jeu. L'utilisateur ne choisit pas de langage ni de PlaceId.
4. Une mauvaise place bloque toute écriture dans Studio; le projet indique quelle place ouvrir. Les erreurs complètes restent dans les détails.
5. Une restauration crée d'abord une sauvegarde de l'état actuel par le flux de checkpoints existant. Une publication d'asset exige une validation préalable.

## Portée de l'implémentation progressive

Cette étape traite l'accueil, la création, la connexion initiale, la navigation et les messages d'état. Les panneaux de tests, versions, assets et places réutilisent leurs fonctions existantes. Une refonte de leurs données ou des moteurs internes n'est pas requise pour ce parcours.
