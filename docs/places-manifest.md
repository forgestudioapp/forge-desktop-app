# Manifeste Places

Forge crée `forge.places.json` à la racine du projet lors de la première liaison depuis la section Places. Exemple :

```json
{
  "version": 1,
  "universeId": "77",
  "sharedFolders": ["src"],
  "places": [
    { "placeId": "101", "name": "Lobby", "role": "lobby", "codeFolders": ["src/places/101"] },
    { "placeId": "202", "name": "Égypte", "role": "Égypte", "codeFolders": ["src/places/202"] }
  ]
}
```

Les scripts Luau déjà présents sous `src/<Service>/` sont communs. Les scripts sous `src/places/<PlaceId>/<Service>/` ne sont envoyés qu'à cette place. Les dossiers `src/places` et `src/shared` sont exclus de la racine commune ; `src/shared` peut être ajouté explicitement à `sharedFolders`. Un chemin cible identique dans le code commun et spécifique est refusé pour éviter un écrasement ambigu.

La suppression d'une liaison ne supprime pas ses fichiers locaux. Les états de synchronisation sont conservés séparément pour chaque PlaceId. Le synchroniseur agit sur la place sélectionnée et vérifie le PlaceId ouvert dans Studio avant la validation et l'application du lot.
