# Protection des lancements médias

Le gestionnaire `media-generate` verrouille maintenant l'élément avant le premier appel asynchrone au fournisseur. Deux appels concurrents visant le même projet, type, élément et variante ne peuvent plus lancer deux générations. Les alias du chemin de projet sont normalisés avec `realpath`.

Après le lancement, les travaux actifs du manifeste empêchent une nouvelle génération du même élément, y compris après un redémarrage : cela inclut les travaux dont le téléchargement ou le suivi distant est en attente. La réponse `MEDIA_BUSY` donne les identifiants déjà connus. Un élément absent est refusé avant l'appel au fournisseur. Le verrou temporaire est libéré en cas de réussite ou d'échec ; les travaux terminés permettent une nouvelle demande explicite.

Portée : les appels `media-generate` sur un même élément existant. Cette protection ne fusionne pas deux nouveaux éléments distincts et ne déduplique pas le gestionnaire `media-variants`, qui crée volontairement de nouveaux éléments. Elle n'assure pas l'idempotence côté fournisseur lorsque celui-ci crée une tâche mais ne renvoie pas son identifiant ; aucun nouvel essai réseau automatique n'est ajouté.

Vérification : 97 tests de l'application réussis, dont cinq tests nouveaux. Les tests couvrent la concurrence, les chemins équivalents, les travaux persistés, les variantes indépendantes, les échecs et le véritable gestionnaire IPC avec chacun des trois fournisseurs simulés. Aucun appel payant n'a été effectué et aucune réduction chiffrée de crédits n'est annoncée.
