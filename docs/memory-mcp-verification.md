# Connecteur mémoire — vérification du 10 septembre 2026

Le connecteur natif optionnel utilisait un processus global lié au premier projet ouvert. Les cinq handlers IPC acceptaient un chemin de projet mais ne le transmettaient pas aux recherches. Il découpait aussi chaque morceau de stdout indépendamment, perdant les réponses JSON fragmentées, et possédait une initialisation qui pouvait attendre son propre état prêt.

`lib/memory-mcp.js` remplace ce transport. Les appels sont sérialisés, utilisent le chemin canonique demandé, réutilisent le processus pour un même projet et changent de processus après la fin de la requête active pour un autre projet. Les événements tardifs d'un ancien processus ne réinitialisent pas le suivant. Le décodage UTF-8 et les lignes JSON sont conservés entre les morceaux de stdout. Les erreurs de processus, de pipe et les délais expirés terminent les requêtes en attente. Une requête échouée n'est jamais rejouée automatiquement.

Le processus démarre uniquement à la première utilisation, s'arrête après 60 secondes d'inactivité et est fermé lorsque Forge quitte. Le lancement utilise les arguments directement, sans shell et sans fenêtre. Les diagnostics conservés et la taille des réponses sont bornés. Aucun modèle ni service payant n'est appelé par ce connecteur.

Validation : 79 tests de l'application réussis, dont 9 nouveaux tests du transport et du routage des cinq handlers IPC. Un test utilise un vrai sous-processus Node simulant un serveur MCP ; les autres couvrent notamment les projets concurrents, les réponses UTF-8 fragmentées, les erreurs, l'expiration, l'inactivité et l'absence du binaire. Syntaxe de main.js et du nouveau module vérifiée.

Limite : le binaire codebase-memory-mcp.exe est absent de ce checkout. La recherche sémantique native et son protocole propre n'ont donc pas été validés de bout en bout. L'index local de fichiers ajouté précédemment reste indépendant et utilisable sans ce binaire. Ce lot ne modifie pas la commande native d'indexation, les configurations MCP propres aux CLI ni les générations de médias. Aucune release publiée ou application installée n'a été modifiée par cette intervention.
