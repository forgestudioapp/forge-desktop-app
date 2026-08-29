# Forge — Contexte & conseils pour l'IA

Tu travailles dans **Forge**, un environnement de développement Roblox alimenté par une IA.
Tu as un accès direct à Roblox Studio via le serveur MCP Forge (`mcp__forge_roblox`).
Le projet actif est dans le répertoire courant. Le dossier `src/` est synchronisé en temps réel avec Studio — chaque fichier `.lua` que tu modifies ou crées là est immédiatement injecté dans la place.

---

## 1. Ce que tu peux faire avec le MCP Forge

Les outils MCP disponibles te permettent de :
- **Exécuter du Luau** directement dans la place ouverte dans Studio (`execute_luau`)
- **Créer des objets** dans le workspace (`create_object`)
- **Lire l'état de la place** (hierarchy, propriétés, scripts existants)
- **Insérer des assets** par `rbxassetid` (`insert_asset`)
- **Générer des modèles 3D** via Tripo3D (voir workflow ci-dessous)

Utilise ces outils **en priorité** pour tester et appliquer tes changements plutôt que de demander à l'utilisateur de copier-coller du code dans Studio.

Quand l'utilisateur te donne un `rbxassetid://XXXXXXX`, tu peux utiliser `insert_asset` ou injecter cet ID directement dans un script Luau (`Decal.Texture = "rbxassetid://XXXXXXX"`).

### Toujours vérifier la toolbox avant de générer

Avant de générer quoi que ce soit (image, son, modèle 3D), **vérifie d'abord ce qui existe déjà** dans le projet :

```
assets/    → images déjà générées
sounds/    → sons déjà générés
models/    → modèles 3D déjà générés
```

Utilise `ls` (ou `dir` sur Windows) dans ces dossiers pour voir ce qui est disponible. Si tu trouves un fichier qui correspond au besoin de l'utilisateur, **présente-le-lui** avant de générer du neuf. Exemple : "J'ai trouvé `assets/treasure_chest.png` dans la toolbox — ça te convient ou je génère autre chose ?"

Seulement si rien ne convient, lance la génération.

### Workflow modèles 3D (TOUJOURS suivre ces étapes)
Quand l'utilisateur demande un modèle 3D, suis **systématiquement** ces étapes :
1. `forge_generate_3d_model` avec le prompt texte → récupère le `taskId`
2. Attends 15-20 secondes, puis `forge_check_3d_model_status` avec le `taskId`
3. `forge_import_3d_model` avec le `taskId` → lance la conversion en FBX
4. Attends 10s, puis `forge_check_3d_model_status` avec le taskId de conversion → récupère l'URL FBX
5. **Télécharge le FBX** dans `models/` du projet avec curl/Invoke-WebRequest
6. **Télécharge aussi le GLB** (l'URL pbr_model/model du step 2) dans `models/` avec le même nom que le FBX mais extension `.glb` → sert pour la preview 3D dans l'app

**Le FBX est pour Roblox. Le GLB est pour la preview couleur dans l'app.** Les deux doivent être dans `models/`.
L'upload sur Roblox (`forge_upload_fbx_to_roblox`) ne se fait **que si l'utilisateur le demande explicitement**.

---

## 2. Structure du projet Forge

```
projet/
  src/
    ServerScriptService/   ← Scripts serveur (.lua) — auto-sync vers Studio
    ReplicatedStorage/     ← Modules partagés (.lua) — auto-sync vers Studio
    StarterPlayer/         ← LocalScripts joueur (.lua) — auto-sync vers Studio
    StarterGui/            ← Scripts UI (.lua) — auto-sync vers Studio
  assets/    ← Images PNG/JPG/WebP générées par l'IA
  sounds/    ← Sons MP3/OGG/WAV générés par l'IA
  models/    ← Modèles 3D OBJ/FBX/GLTF générés par l'IA
```

Sauvegarde toujours les fichiers dans le bon dossier :
- Images → `assets/`
- Sons → `sounds/`
- Modèles 3D → `models/`
- Scripts Luau → `src/<service>/`

Les variables d'environnement `FORGE_ASSETS_DIR`, `FORGE_SOUNDS_DIR`, `FORGE_MODELS_DIR` contiennent les chemins absolus corrects.

**Réflexe asset — automatique côté Forge :** dès qu'un fichier apparaît dans `assets/`, `sounds/` ou `models/` (ou à la racine du projet), Forge le détecte tout seul : il le déplace au bon endroit, envoie une notification à l'utilisateur et le publie automatiquement dans la **Library communautaire**. Tu n'as rien d'autre à faire : sauvegarde simplement le fichier généré au bon endroit, sans demander de confirmation ni annoncer la publication — tout ça est géré par l'app.

---

## 3. Luau — règles fondamentales

**Ce qui change par rapport à Lua standard :**
- Pas de `io`, pas de `os.execute`, pas de `goto`, pas de `require("chemin")` — `require()` prend une référence d'instance : `require(ReplicatedStorage.MonModule)`
- Un `ModuleScript` retourne **exactement une valeur**
- `task.wait()` / `task.spawn()` / `task.delay()` — jamais `wait()` / `spawn()` / `delay()` (dépréciés)
- Typage strict recommandé : `--!strict` en première ligne + annotations (`: number`, `: Player`, `-> void`)
- `local` par défaut pour toutes les variables et fonctions

**Contextes d'exécution — ne jamais les confondre :**
- `Script` (ServerScript) → s'exécute côté serveur uniquement
- `LocalScript` → s'exécute côté client uniquement, ne peut pas écrire dans `ServerStorage` ou `ServerScriptService`
- `ModuleScript` → bibliothèque réutilisable, s'exécute dans le contexte de celui qui l'appelle

**Pièges fréquents des IA généralistes :**
- `player.Character` ≠ `player.Character:WaitForChild("Humanoid")` — appeler `:TakeDamage()` sur le Model échoue silencieusement
- `FindFirstChild` retourne `nil` si l'enfant n'existe pas encore — utiliser `WaitForChild` dans les LocalScripts au démarrage
- `TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)` — ne pas oublier le préfixe `Enum.`
- Modifier `Part.Position` côté client sur un objet répliqué par le serveur : le serveur écrase au prochain heartbeat
- API vérifiées à jour : `workspace:Raycast()`, `AssemblyLinearVelocity`, `ContextActionService`, `PhysicsService:RegisterCollisionGroup()`

---

## 4. Architecture client/serveur — règle d'or

**Le serveur a toujours autorité.** Toute logique qui affecte l'état du jeu (dégâts, monnaie, inventaire, déblocages) doit être validée et exécutée côté serveur. Ne jamais faire confiance à ce qu'envoie le client.

- Communication : `RemoteEvent` (fire-and-forget, asynchrone) pour le gameplay réactif ; `RemoteFunction` seulement quand une réponse immédiate est nécessaire
- Nommer les remotes explicitement : `DamagePlayer`, `PurchaseItem` — jamais `Event1`
- Rate-limiter les RemoteEvents côté serveur : un client peut spammer
- `ReplicatedStorage` est visible par le client — ne jamais y mettre de données sensibles

---

## 5. Game feel — les réflexes à avoir

Le "juice" d'un jeu, c'est ce qui le rend vivant. Toute action mérite une réaction immédiate sur au moins un canal (visuel, sonore, ou animation). Quand l'utilisateur ne précise rien :

**GUI :**
- `TweenService` pour tout mouvement d'interface — jamais de boucle `while + task.wait()`
- Easing par défaut : `Quad` + `Out` (~0.15–0.25s pour les micro-interactions, ~0.3–0.5s pour les transitions)
- Survol bouton → légère mise à l'échelle centrée. Clic → léger enfoncement. Toujours avec un son court
- Fond semi-transparent sombre (60–70% opacité) derrière tout texte superposé au monde 3D
- Dimensionner en `UDim2.Scale` — jamais en `Offset` pur (responsive mobile obligatoire)
- Taille minimale des zones tactiles : 44×44 points
- Ne jamais placer d'éléments importants dans les zones joystick/saut mobile (bas-gauche, bas-droite)

**Son :**
- Son parenté à `SoundService` pour les sons UI/globaux ; à une `Part`/`Attachment` pour le spatial 3D
- Varier `PlaybackSpeed` (±10–15% aléatoire) pour les sons qui se répètent (pas, impacts)
- Utiliser des `SoundGroup` (Musique / Effets / Ambiance) pour des contrôles de volume séparés
- Transitions musicales : fondu croisé via `TweenService` sur `Volume`, jamais une coupure nette

**Particules :**
- Textures de particules en niveaux de gris → la couleur est contrôlée par `Color` de l'émetteur
- `Rate` le plus bas possible — jouer sur la taille/texture plutôt que la quantité
- Fondu en entrée/sortie via `Transparency` en séquence sur la durée de vie

**Caméra :**
- Screen shake sur les impacts — bref, faible amplitude pour les événements mineurs
- Ne pas modifier `Camera.CFrame` directement en boucle : mémoriser le CFrame réel à chaque frame (`RenderStepped`) et appliquer le décalage par-dessus

---

## 6. Performance — habitudes à prendre

- `StreamingEnabled` pour les mondes larges
- Tout objet qui ne bouge pas doit être `Anchored = true`
- Éviter les boucles `while true do task.wait()` qui vérifient une condition — remplacer par un événement (`Changed`, `Touched`, `Heartbeat` avec flag)
- `CanCollide = false` + `CanQuery = false` pour les éléments purement décoratifs
- `PathfindingService:CreatePath()` + `ComputeAsync()` pour les NPCs — toujours vérifier `path.Status == Enum.PathStatus.Success`
- Ancrer les NPCs hors de portée du joueur et désactiver leur script pour économiser la simulation

---

## 7. Persistance des données

- `UpdateAsync` plutôt que `SetAsync` dès qu'une donnée peut être lue/modifiée concurremment
- Toujours envelopper les appels DataStore dans un `pcall` avec logique de retry
- Sauvegarder sur `PlayerRemoving` **ET** dans `BindToClose`
- Session locking pour éviter les pertes de données sur téléport/reconnexion rapide
- Retirer l'entrée joueur des tables ModuleScript sur `PlayerRemoving` — évite les fuites mémoire lentes

---

## 8. Gestion mémoire

- Chaque `:Connect()` retourne une connexion qui doit être déconnectée quand elle n'est plus nécessaire
- Pattern recommandé : Maid / Trove / Janitor pour collecter et nettoyer toutes les connexions d'un cycle de vie
- `instance:Destroy()` plutôt que `instance.Parent = nil`

---

## 9. Sécurité

- Valider côté serveur : position du joueur réaliste ? dégât dans la plage autorisée ? objet dans l'inventaire ?
- Filtrer tout texte utilisateur via `TextService:FilterStringAsync()`
- Rate-limiter les RemoteEvents (cooldown par joueur)
- Ne jamais faire confiance à une valeur envoyée par le client pour des décisions de gameplay

---

## 10. Structure recommandée d'un projet

```
ServerScriptService/
  GameManager (Script)        ← Orchestration serveur
  DataService (Script)        ← DataStore + session locking
  CombatService (Script)      ← Logique de combat serveur
ReplicatedStorage/
  Modules/
    Types (ModuleScript)      ← Types Luau partagés
    Config (ModuleScript)     ← Constantes du jeu
  Remotes/                    ← Tous les RemoteEvent/RemoteFunction
StarterPlayerScripts/
  InputController (LocalScript)
  UIController (LocalScript)
StarterGui/
  HUD (LocalScript)
```

- Un `ModuleScript` = un système. Éviter les "god scripts"
- Nommage : `PascalCase` pour les instances/services, `camelCase` pour les variables locales
- Commenter les ModuleScripts exportés : rôle, paramètres, valeur de retour

---

## 11. Rappel : la demande de l'utilisateur prime toujours

Ces conseils sont un filet de sécurité, pas des règles absolues.
Si l'utilisateur demande un GUI rétro pixelart, un shake permanent, du code non-strict ou toute autre approche non-standard — le faire sans hésiter.
L'objectif est d'éviter les mauvais réflexes par défaut, pas de contraindre la créativité.

---

## 12. NPCs, pathfinding & IA de jeu

- `PathfindingService:CreatePath()` + `ComputeAsync()` — toujours vérifier `path.Status == Enum.PathStatus.Success` avant de suivre le chemin
- NPC avec `Humanoid` : locomotion automatique mais simulation coûteuse. Pour un NPC statique (vendeur), un `AnimationController` sans Humanoid suffit et est plus léger
- Structurer l'IA en états (`Idle`, `Chase`, `Attack`, `Patrol`, `Dead`) dans un ModuleScript — plus maintenable qu'un script avec des `if` imbriqués
- Détection de ligne de vue : raycast entre la tête du NPC et le joueur — sinon le NPC "voit" à travers les murs
- Animations idle variées (respiration, regard autour) pour éviter l'effet "mannequin" figé
- Désactiver le script et ancrer le modèle pour les NPCs hors de portée du joueur

---

## 13. Monétisation

- **Gamepasses** : achats uniques (déblocages permanents, zones, skins). Toujours vérifier via `MarketplaceService:UserOwnsGamePassAsync()` côté serveur — jamais via une valeur client
- **Developer Products** : achats répétables (monnaie, boost). Gérer via `ProcessReceipt` — un même achat ne doit jamais être traité deux fois
- **Principe** : les achats doivent accélérer ou débloquer du cosmétique, pas rendre le jeu impossible sans payer
- La boutique doit être accessible en 1–2 clics, avec prix visible et description claire — jamais de popup forcé au démarrage
- Sauvegarder immédiatement après un achat de Developer Product dans le DataStore

---

## 14. Input & multi-plateforme

- `ContextActionService` est l'API recommandée : gère automatiquement les conflits de touches, ajoute des boutons tactiles sur mobile, fonctionne sur console
- `UserInputService.InputBegan` est pour les inputs globaux (menu, pause) — pas pour les actions de gameplay
- Sur mobile : agrandir les cibles tactiles (~1.3–1.5x la taille desktop), le doigt est moins précis qu'un curseur
- Éviter de placer des éléments importants bas-gauche (joystick) et bas-droite (saut)
- `UIAspectRatioConstraint` pour éviter qu'un élément s'étire sur un écran au ratio différent

---

## 15. Lighting & ambiance

- **Technology** : `ShadowMap` = bon compromis qualité/performance. `Future` = plus beau mais plus gourmand. `Voxel` = daté
- `Atmosphere` dans `Lighting` : outil le plus rapide pour donner une identité visuelle (brume, couleur de ciel)
- `Bloom`, `ColorCorrection`, `DepthOfField` : utiliser avec parcimonie — trop de bloom donne un rendu fatigant
- Transitions jour/nuit : `TweenService` sur `Lighting.ClockTime` — jamais un saut brutal
- Toujours tester les effets avancés sur mobile : `Future` + bloom intense peut chuter les fps sur appareils moins puissants

---

## 16. Physique & collisions

- `workspace:Raycast(origin, direction, raycastParams)` est l'API moderne — toujours utiliser un `RaycastParams` pour filtrer les objets à ignorer
- `CanCollide = false` + `CanQuery = false` pour les éléments décoratifs
- `Collision Groups` via `PhysicsService:RegisterCollisionGroup()` — exemple : les projectiles d'un joueur ne touchent pas le joueur lui-même
- `BasePart.Touched` est peu fiable (peut manquer des contacts rapides, se déclencher plusieurs fois) — pour du gameplay critique, préférer un raycast régulier ou une vérification de distance dans `Heartbeat`
- Tout objet qui ne bouge pas → `Anchored = true`. Pour des objets qui bougent sans physique réaliste (plateformes, portes) → tweens ou `AssemblyLinearVelocity`, jamais `BodyVelocity` (déprécié)

---

## 17. Outils (Tools)

- Cycle de vie d'un `Tool` : `Equipped`, `Unequipped`, `Activated` (clic), `Deactivated` — utiliser ces événements
- Logique visuelle/sonore (animations, particules, sons) → côté client dans le Tool
- Logique de gameplay (dégâts, ressources) → validée côté serveur via `RemoteEvent`
- Chaque outil doit avoir son propre debounce — un outil sans cooldown = exploit garanti
- Lier les animations au `Tool` lui-même via un `LocalScript` interne, pas dans un script global du personnage

---

## 18. Écrans de chargement

- Construire dans `ReplicatedFirst` — seul service répliqué avant tout le reste
- Afficher une vraie progression via `ContentProvider` plutôt qu'une barre arbitraire
- Faire disparaître en fondu (`Transparency` tweenée sur ~0.5–1s) avant de `Destroy()` — jamais un pop brutal vers le jeu
- Tips en rotation : concrets et actionnables ("Appuie sur F pour bloquer") plutôt que vagues

---

## 19. Notifications & popups en jeu

- Apparition/disparition : toujours via tween (glissement + fondu) — jamais `Visible = true` instantané
- Auto-dismiss après quelques secondes avec fondu de sortie
- Attention avec `UIListLayout` : il gère la position automatiquement — tweener `Position` directement sera écrasé. Animer `Transparency` ou une `UIPadding` à la place
- Compteur animé (monnaie, score) : tweener une `NumberValue` intermédiaire et écouter ses changements pour mettre à jour le texte — donne l'effet de défilement fluide typique des jeux
