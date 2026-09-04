# Forge — Contexte & conseils pour l'IA

Tu travailles dans **Forge**, un environnement de développement Roblox alimenté par une IA.
Tu as un accès direct à Roblox Studio via le serveur MCP Forge (`mcp__forge_roblox`).
Le projet actif est dans le répertoire courant. Le dossier `src/` est synchronisé en temps réel avec Studio — chaque fichier que tu modifies ou crées là est immédiatement injecté dans la place.

**Langage du projet :** Vérifie l'extension des fichiers dans `src/` :
- Si tu vois des fichiers `.ts` ou `.tsx` → le projet est en **TypeScript** (roblox-ts). Écris du TypeScript.
- Si tu vois des fichiers `.lua` → le projet est en **Luau**. Écris du Luau.
- Par défaut, les nouveaux projets sont en **TypeScript**.

**Préfixe MCP :** Tous les outils ci-dessous sont préfixés par `mcp__forge_roblox__`. Exemple : `mcp__forge_roblox__execute_luau`.

---

## 1. Outils MCP Forge (52 outils)

Utilise ces outils **en priorité** pour tester et appliquer tes changements plutôt que de demander à l'utilisateur de copier-coller du code dans Studio.

### 1.1 Exécution & test

| Outil | Description |
|-------|-------------|
| `execute_luau` | Exécute du Luau arbitraire dans la place ouverte |
| `start_playtest` | Lance une session de playtest (play/run) |
| `stop_playtest` | Arrête le playtest en cours |
| `get_playtest_output` | Récupère le buffer de sortie pendant le playtest |
| `undo` | Annule la dernière action |
| `redo` | Rétablit la dernière action annulée |

### 1.2 Requête & inspection du Place

| Outil | Description |
|-------|-------------|
| `get_file_tree` | Arborescence complète des instances |
| `search_files` | Recherche par nom, classe ou contenu de script |
| `get_place_info` | Place ID, nom, paramètres du jeu |
| `get_services` | Services disponibles et leurs enfants |
| `search_objects` | Trouve des instances par nom, classe ou propriétés |
| `get_instance_properties` | Toutes les propriétés d'une instance |
| `get_instance_children` | Enfants d'un parent |
| `search_by_property` | Trouve des objets par valeur de propriété |
| `get_class_info` | Propriétés/méthodes disponibles pour une classe |
| `get_project_structure` | Hiérarchie complète du jeu |
| `get_selection` | Objets actuellement sélectionnés dans Studio |

### 1.3 Propriétés

| Outil | Description |
|-------|-------------|
| `set_property` | Définit une propriété sur une instance |
| `mass_set_property` | Applique la même propriété sur plusieurs instances |
| `mass_get_property` | Lit la même propriété sur plusieurs instances |
| `set_calculated_property` | Définit des propriétés via formules mathématiques |
| `set_relative_property` | Modifie des propriétés par rapport à leurs valeurs actuelles |

### 1.4 Création & gestion d'objets

| Outil | Description |
|-------|-------------|
| `create_object` | Crée un nouvel objet Roblox |
| `create_object_with_properties` | Crée un objet avec propriétés initiales |
| `mass_create_objects` | Crée plusieurs objets en une fois |
| `mass_create_objects_with_properties` | Crée plusieurs objets avec propriétés |
| `delete_object` | Supprime une instance |
| `smart_duplicate` | Duplication intelligente (nommage, positionnement, variations) |
| `mass_duplicate` | Plusieurs smart_duplicate en une fois |
| `reparent_instance` | Déplace une instance vers un nouveau parent |
| `clone_instance` | Copie profonde (Instance:Clone()) |
| `insert_asset` | Insère un asset catalogue par rbxassetid via InsertService |

### 1.5 Scripts

| Outil | Description |
|-------|-------------|
| `get_script_source` | Récupère le source code d'un script (avec numéros de ligne) |
| `set_script_source` | Remplace entièrement le source d'un script |
| `edit_script_lines` | Remplace des lignes spécifiques |
| `insert_script_lines` | Insère des lignes à une position |
| `delete_script_lines` | Supprime des lignes spécifiques |
| `search_replace_scripts` | Search/replace dans tous les scripts |

### 1.6 UI

| Outil | Description |
|-------|-------------|
| `create_ui` | Crée des éléments UI en batch avec UDim2 |

### 1.7 Terrain

| Outil | Description |
|-------|-------------|
| `fill_terrain` | Remplit une zone rectangulaire avec un matériau terrain |
| `fill_terrain_sphere` | Remplit une zone sphérique avec un matériau terrain |
| `clear_terrain` | Efface le terrain (zone ou tout) |
| `get_terrain_materials` | Liste les noms des matériaux terrain disponibles |

### 1.8 Attributes & Tags

| Outil | Description |
|-------|-------------|
| `get_attribute` | Lit un attribut |
| `set_attribute` | Définit un attribut |
| `get_attributes` | Liste tous les attributs |
| `delete_attribute` | Supprime un attribut |
| `get_tags` | Liste les tags d'une instance |
| `add_tag` | Ajoute un tag |
| `remove_tag` | Supprime un tag |
| `get_tagged` | Trouve toutes les instances avec un tag |

### 1.9 Forge API (hors Studio)

| Outil | Description |
|-------|-------------|
| `forge_hello` | Test de connexion |
| `forge_get_roblox_account` | Infos du compte Roblox connecté (OAuth) |
| `forge_list_universes` | UniverseId/PlaceId du jeu ouvert dans Studio |
| `forge_create_gamepass` | Crée un game pass via Open Cloud |
| `forge_list_gamepasses` | Liste les game passes existants |
| `forge_roblox_api` | Appel générique à l'API Roblox Open Cloud (GET/POST/PATCH/DELETE) |
| `forge_create_test_part` | Crée un Part coloré de test dans Workspace |

### 1.10 Modèles 3D (Tripo3D)

| Outil | Description |
|-------|-------------|
| `forge_generate_3d_model` | Étape 1 : Génère un modèle 3D à partir d'un prompt texte |
| `forge_check_3d_model_status` | Étape 2 : Vérifie le statut d'une tâche de génération/conversion |
| `forge_import_3d_model` | Étape 3 : Convertit le modèle généré en FBX |
| `forge_upload_fbx_to_roblox` | Upload le FBX sur Roblox en tant qu'asset |
| `forge_check_upload_status` | Vérifie le statut d'un upload d'asset |

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

### Toujours vérifier la toolbox avant de générer

Avant de générer quoi que ce soit (image, son, modèle 3D), **vérifie d'abord ce qui existe déjà** dans le projet :

```
assets/    → images déjà générées
sounds/    → sons déjà générés
models/    → modèles 3D déjà générés
```

Utilise `ls` (ou `dir` sur Windows) dans ces dossiers pour voir ce qui est disponible. Si tu trouves un fichier qui correspond au besoin de l'utilisateur, **présente-le-lui** avant de générer du neuf. Exemple : "J'ai trouvé `assets/treasure_chest.png` dans la toolbox — ça te convient ou je génère autre chose ?"

Seulement si rien ne convient, lance la génération.

Quand l'utilisateur te donne un `rbxassetid://XXXXXXX`, tu peux utiliser `insert_asset` ou injecter cet ID directement dans un script Luau (`Decal.Texture = "rbxassetid://XXXXXXX"`).

---

## 2. Structure du projet Forge

### Projet Luau (legacy)
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

### Projet TypeScript (recommandé)
```
projet/
  src/
    ServerScriptService/   ← Scripts serveur (.server.ts) — compilé en Luau
    ReplicatedStorage/     ← Modules partagés (.ts) — compilé en Luau
    StarterPlayer/         ← LocalScripts (.client.ts) — compilé en Luau
    StarterGui/            ← Scripts UI (.client.ts) — compilé en Luau
  out/                     ← Luau compilé (auto-généré par rbxtsc)
  tsconfig.json            ← Config roblox-ts
  default.project.json     ← Config Rojo
  assets/    ← Images PNG/JPG/WebP générées par l'IA
  sounds/    ← Sons MP3/OGG/WAV générés par l'IA
  models/    ← Modèles 3D OBJ/FBX/GLTF générés par l'IA
```

Sauvegarde toujours les fichiers dans le bon dossier :
- Images → `assets/`
- Sons → `sounds/`
- Modèles 3D → `models/`
- Scripts Luau → `src/<service>/` (extension `.lua`)
- Scripts TypeScript → `src/<service>/` (extension `.server.ts`, `.client.ts`, ou `.ts`)

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

## 3b. TypeScript (roblox-ts) — règles fondamentales

**Si le projet est en TypeScript**, utilise roblox-ts pour écrire du code qui sera compilé en Luau automatiquement.

**Structure du projet TypeScript :**
```
projet/
  src/
    ServerScriptService/   ← Scripts serveur (.server.ts)
    ReplicatedStorage/     ← Modules partagés (.ts)
    StarterPlayer/         ← LocalScripts (.client.ts)
    StarterGui/            ← Scripts UI (.client.ts)
  out/                     ← Luau compilé (auto-généré, ne pas éditer)
  tsconfig.json            ← Config roblox-ts
  default.project.json     ← Config Rojo
```

**Règles TypeScript :**
- Extensions : `.server.ts` (serveur), `.client.ts` (client), `.ts` (modules partagés)
- Import les services Roblox depuis `@rbxts/services` : `import { Players, ReplicatedStorage } from "@rbxts/services";`
- Typage strict : toujours typer les paramètres et les retours de fonctions
- `task.wait()`, `task.spawn()`, `task.delay()` — jamais `wait()` / `spawn()`
- JSX pour les GUI : `<frame>`, `<textlabel>`, `<textbutton>` avec `@rbxts/react`
- NE JAMAIS modifier les fichiers dans `out/` — c'est le dossier compilé
- NE JAMAIS éditer `.luau` ou `.lua` dans un projet TypeScript

**Exemple de script serveur TypeScript :**
```typescript
import { Players, ReplicatedStorage } from "@rbxts/services";

const remoteEvent = new Instance("RemoteEvent");
remoteEvent.Name = "DamagePlayer";
remoteEvent.Parent = ReplicatedStorage;

Players.PlayerAdded.Connect((player) => {
    print(`[Forge] ${player.Name} connecté !`);
});
```

**Exemple de GUI avec React :**
```tsx
import React, { useState } from "@rbxts/react";
import { createRoot } from "@rbxts/react-roblox";

function App() {
    const [count, setCount] = useState(0);
    return (
        <frame Size={UDim2.fromScale(1, 1)}>
            <textbutton
                Text={`Cliques: ${count}`}
                Size={UDim2.fromScale(0.3, 0.1)}
                Position={UDim2.fromScale(0.35, 0.45)}
                Event={{ Activated: () => setCount(count + 1) }}
            />
        </frame>
    );
}
```

**Compilation :** Le dossier `src/` est compilé en Luau dans `out/` via `rbxtsc`. La synchro avec Studio se fait sur les fichiers compilés dans `out/`.

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

**GUI — Structure & lisibilité :**
- `TweenService` pour tout mouvement d'interface — jamais de boucle `while + task.wait()`
- Easing par défaut : `Quad` + `Out` (~0.15–0.25s pour les micro-interactions, ~0.3–0.5s pour les transitions)
- Survol bouton → légère mise à l'échelle centrée. Clic → léger enfoncement. Toujours avec un son court
- Les éléments interactifs (boutons, icônes, cartes, slots) doivent réagir : au survol, l'échelle grossit légèrement (~1.05–1.1, centré, avec `AnchorPoint` et tween ~0.15s). Au clic sur une image/miniature, **agrandis-la en popup** (fullscreen/scrim) avec fondu + un petit son de clic. Fermer le popup au clic sur le fond ou une croix. Ne jamais rendre un élément cliquable sans feedback visuel OU sonore clair
- Fond semi-transparent sombre (60–70% opacité) derrière tout texte superposé au monde 3D
- Dimensionner en `UDim2.Scale` — jamais en `Offset` pur (responsive mobile obligatoire). `Offset` uniquement pour les bordures, padding, et icônes en taille fixe
- `UIAspectRatioConstraint` sur tout élément dont la forme compte (avatars, slots d'inventaire, icônes, minimap)
- `UISizeConstraint` pour borner la taille max/min des panels sur les grands écrans
- Utiliser `UIListLayout`, `UIGridLayout`, `UIPadding` plutôt que du positionnement manuel — le layout recalcule automatiquement quand la taille change
- `ScreenGui.ScreenInsets = Enum.ScreenInsets.DeviceSafeInsets` sur les calques interactifs pour éviter les notches/home indicator
- Désactiver un panneau via `ScreenGui.Enabled = false` (pas `.Visible` sur chaque enfant) — plus performant

**GUI — Polissage visuel :**
- **UIStroke sur texte** : Toujours ajouter un `UIStroke` noir (Color3.new(0,0,0), Thickness 1–2) sur les TextLabel/TextButton qui se superposent au monde 3D. C'est ce qui rend le texte lisible sur n'importe quel fond
- **UICorner** : Coins arrondis (`UDim.new(0, 6–12)`) sur tous les frames et boutons — look moderne, sans effort
- **UIGradient** : Gradient subtil (haut plus clair, bas plus sombre, ~15–20% de différence de brightness) sur les frames pour créer une profondeur de relief
- **UIStroke glow** : Stroke semi-transparent en couleur d'accent sur les boutons importants — bleu pour info, or pour premium, vert pour succès. Thickness ~2, Transparency ~0.5–0.7
- **StrokeSizingMode.ScaledSize** : Utiliser ce mode pour que le stroke scale avec la taille du parent (valeur entre 0 et 1)
- **UIShadow** : Ombre portée derrière les panels/cards important (Adjustable blur, offset, color)
- **CanvasGroup** : Pour tweener la transparence d'un groupe entier, tweener `GroupTransparency` d'un seul CanvasGroup au lieu de tweener chaque enfant

**GUI — Mobile & accessibilité :**
- Taille minimale des zones tactiles : 48×48 pixels (pas 44, le doigt est moins précis qu'un curseur)
- Ne jamais placer d'éléments importants dans les zones joystick/saut mobile (bas-gauche, bas-droite)
- Agrandir les cibles tactiles (~1.3–1.5x la taille desktop) sur mobile
- `UIAspectRatioConstraint` pour éviter qu'un élément s'étire sur un écran au ratio différent
- Contraste minimum 4.5:1 sur le texte — si le fond est variable, le stroke noir suffit généralement

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
- Performance UI : ne pas tweener `UIStroke.Thickness` sur du texte (provoque du flickering) — tweener `Transparency` à la place. Budget < 300 UIStroke à l'écran. Ne pas mettre à jour un TextLabel toutes les frames si la valeur ne change pas souvent — throttler à 100ms max

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
