# Fiabilité du pont Studio — 12 septembre 2026

L'audit a confirmé plusieurs défauts du transport : chaque poll pouvait reprendre une commande déjà remise au plugin, une demande HTTP arrivée pendant une période sans heartbeat pouvait annuler d'autres commandes, et les écouteurs principal et historique conservaient des états de connexion distincts malgré une file partagée.

Corrections :

- `/poll` réclame une commande une seule fois. Les commandes suivantes ne sont pas bloquées par la première ; les réponses restent associées à leur identifiant.
- Aucune remise automatique d'une commande déjà transmise. Si la réponse HTTP de livraison ou le résultat se perd, le timeout annonce que le résultat est incertain et demande de vérifier la scène avant de réessayer. Il ne garantit pas une exécution exactement une fois malgré toutes les pannes réseau.
- Le délai ordinaire passe de 5 à 30 secondes. Les délais spécifiques de capture/insertion restent conservés. Les messages distinguent commande non récupérée et résultat non confirmé.
- Une absence récente de heartbeat refuse les nouveaux appels concernés sans annuler les opérations en cours. Une déconnexion explicite annule toujours les requêtes en attente.
- Un retour `/response` met à jour le signe de vie. Les ports principal et historique partagent désormais la présence du plugin dans BridgeService.
- Les appels MCP directs vérifient la présence du plugin avant de placer une commande dans la file. Les outils autonomes tels que Blender restent utilisables sans Studio.
- `/health` et `/status` exposent la date du dernier signe de vie, les nombres de commandes en attente/en cours et `bridgeProtocol: 2`, sans inclure les arguments des commandes.

Validation : compilation TypeScript réussie, 71 tests du pont réussis, dont six nouveaux tests couvrant la livraison unique, les réponses dans le désordre, le heartbeat périmé, les deadlines, les réponses tardives et le partage entre écouteurs. `git diff --check` ne signale pas d'erreur.

Le contrôle en lecture seule du pont actuellement lancé sur 58741 et 3002 indiquait `pluginConnected: false` et `mcpServerActive: true`. Ses réponses n'exposaient pas encore bridgeProtocol : ce processus n'avait pas chargé le code corrigé. Aucune connexion réelle avec Studio n'a donc été déclarée réparée ni aucun processus utilisateur arrêté. Il reste à relancer Forge sur le code modifié et à activer/connecter son plugin dans la bonne place Studio pour valider le parcours réel.
