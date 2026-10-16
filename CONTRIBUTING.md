# Contribuer à Forge

Merci de contribuer à Forge. Ce dépôt utilise un flux simple afin de protéger la branche publiée et de faciliter les revues.

## Avant de commencer

1. Ouvre une issue ou confirme la tâche avec le propriétaire du dépôt.
2. Crée une branche depuis `main` avec un nom explicite, par exemple `feature/project-import` ou `fix/startup-crash`.
3. Ne travaille jamais directement sur `main`.

## Développement

```powershell
npm ci
npm test
npm start
```

- Garde chaque pull request centrée sur un seul problème.
- Explique le comportement avant et après la modification.
- Ajoute ou adapte des tests lorsqu'une logique importante change.
- Ne modifie pas la publication, les licences, l'authentification, les paiements ou les secrets sans accord explicite du propriétaire.

## Secrets et données privées

Ne commit jamais de mot de passe, jeton, clé d'API, session, fichier `.env`, donnée utilisateur ou fichier local généré par Forge. Utilise des variables d'environnement et des valeurs factices dans les tests.

Si tu découvres une information sensible, ne crée pas d'issue publique. Contacte directement le propriétaire du dépôt.

## Pull request

Avant d'ouvrir une pull request :

```powershell
npm test
git status
```

La pull request doit passer les tests automatiques et être approuvée par le propriétaire avant fusion. Utilise de préférence **Squash and merge** pour garder un historique lisible.
