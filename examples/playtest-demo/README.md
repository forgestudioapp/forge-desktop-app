# Projet temporaire de démonstration des playtests

Ce dossier est un exemple local distinct de Tower Defense. Le `PlaceId` `123456` est fictif : crée une place Roblox de test, associe-la à une copie de ce projet dans Forge et remplace `placeId` dans `.forge/tests/demo-solo.json` par celui de la place publiée. Attends que Forge confirme la dernière version locale dans Studio avant de lancer `forge_run_playtest_scenario` avec `name: "demo-solo"`.

Les scénarios sont des fichiers JSON versionnables dans `.forge/tests/`. La version 1 accepte `profile: "desktop-solo"` et des étapes ordonnées `start`, `wait`, `move`, `key`, `click`, `text`, `action`, `assert`, `console`, `screenshot`, `stop`. `start` est premier, `stop` est dernier ; l'assertion finale suit les actions. `requiredConsoles` indique les consoles qui doivent être lues pour permettre PASS. Les rapports et captures sont conservés dans `.forge/tests/reports/`.

Les exemples de rapport joints sont **illustratifs** et proviennent d'un pont Studio simulé par les tests automatisés. Ils ne témoignent pas d'un playtest réel dans Roblox Studio.
