# Composants GUI Forge

Base réutilisable, à adapter à la direction artistique du jeu. Inspecte d'abord les composants et frameworks déjà présents : complète-les au lieu d'installer un second système. N'ajoute ces fichiers aux sources que pour une tâche GUI qui en a besoin.

`ForgeUI.lua` fournit deux composants sans dépendance :

- `UI.button(parent, options)` : texte, thème, ordre, état initial et callback `onActivated(controller)`. Activation souris/tactile/manette, focus et survol via UIScale centré. États `normal`, `loading`, `disabled`, `success`, `error`. Une action en cours bloque les doubles activations ; une exception affiche « Réessayer ». Le callback peut décider de l'état final avec `controller:setState(state, label)`.
- `UI.window(parent, options)` : titre, fermeture, largeur/hauteur relatives avec maximum 640 × 480 et corps défilant avec disposition verticale. `window.body` reçoit les boutons ou le contenu existant. Ce composant n'est pas un gestionnaire de modales : pour un menu exclusif, gère le focus et le blocage du jeu selon le système existant.

`controller:destroy()` ou la destruction du parent nettoie les connexions et animations. Le callback est une action client ; une monnaie ou un achat reste validé par les services serveur existants. `theme` reprend toutes les clés de `UI.Theme` et permet une palette propre au projet. Aucun média, réseau, prix ou achat n'est généré par le kit.

Dans un projet Luau, copie le module dans un ModuleScript partagé selon le mapping Rojo réel, puis appelle-le depuis un LocalScript :

```lua
local UI = require(game:GetService("ReplicatedStorage"):WaitForChild("ForgeUI"))
local screen = Instance.new("ScreenGui")
screen.Name = "GameMenu"
screen.ResetOnSpawn = false
screen.Parent = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
local menu = UI.window(screen, { title = "Mon jeu" })
UI.button(menu.body, { text = "Jouer", onActivated = function()
    menu.root.Visible = false
    -- Appeler le vrai contrôleur de jeu existant.
end })
```

Ne crée pas plusieurs ScreenGui de même rôle lors d'une reprise. Dans un projet TypeScript/roblox-ts, conserve ses sources TS et son framework existant : ce module Luau est une référence de comportement à porter dans ses composants, pas une exception à la configuration de compilation.

Vérifie en playtest : petit écran et portrait, texte long, liste vide et longue, navigation manette, focus à la fermeture, action lente, échec et destruction pendant une action. La construction des instances peut être testée en Studio ; elle ne prouve pas à elle seule la lisibilité ni le bon parcours joueur.

API de référence : [GuiButton.Activated](https://create.roblox.com/docs/reference/engine/classes/GuiButton), [UIScale](https://create.roblox.com/docs/reference/engine/classes/UIScale).
