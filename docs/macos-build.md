# Distribuer Forge sur macOS depuis Windows

Ce guide permet de publier Forge pour les Mac Apple Silicon (`arm64`) et Intel (`x64`) sans posséder de Mac. GitHub Actions exécute la compilation sur un Mac distant. Le PC Windows sert à créer et conserver les identifiants Apple, configurer GitHub et déclencher la livraison.

## Résultat attendu

Une livraison Forge produit :

- `Forge-<version>-mac-arm64.dmg` pour les Mac M1, M2, M3, M4 et suivants ;
- `Forge-<version>-mac-x64.dmg` pour les Mac Intel ;
- les ZIP correspondants pour les mises à jour ;
- des sommes SHA-256 dans `release-checksums-macos.json`.

Les applications sont signées avec un certificat **Developer ID Application**, envoyées à Apple pour notarisation, puis contrôlées par `codesign`, `stapler` et Gatekeeper avant leur publication.

## Ce qui est déjà prêt dans Forge

- cible DMG et ZIP pour `arm64` et `x64` ;
- runtime Node propre à chaque architecture ;
- terminal intégré compatible avec Codex CLI et Claude Code ;
- détection de Roblox Studio dans `/Applications` et `~/Applications` ;
- installation du plugin dans `~/Documents/Roblox/Plugins` ;
- chemins Homebrew et CLI utilisateur ;
- runtime renforcé Apple et signature des exécutables embarqués ;
- compilation, notarisation et vérifications dans `.github/workflows/build.yml`.

Le détourage local U²-Net est la seule fonction volontairement indisponible sur macOS. Les autres fonctions média et les clés API restent disponibles.

## Étape 1 — Créer le compte Apple Developer

1. Ouvrir <https://developer.apple.com/programs/>.
2. Se connecter avec l’Apple Account qui possédera Forge.
3. Activer l’authentification à deux facteurs si Apple la demande.
4. S’inscrire à l’Apple Developer Program.
5. Attendre que l’adhésion soit indiquée comme active.
6. Dans la page d’adhésion Apple Developer, noter le **Team ID**.

Le compte propriétaire doit rester sous le contrôle du responsable de Forge. Ne partager ni mot de passe, ni code à deux facteurs, ni clé privée.

## Étape 2 — Préparer OpenSSL sur le PC Windows

Git for Windows installé sur ce PC contient déjà OpenSSL ici :

```text
C:\Program Files\Git\usr\bin\openssl.exe
```

Dans PowerShell, créer un dossier privé hors du dépôt Git :

```powershell
$OpenSSL = 'C:\Program Files\Git\usr\bin\openssl.exe'
$SigningDir = Join-Path $env:USERPROFILE 'Forge-Apple-Signing'
New-Item -ItemType Directory -Path $SigningDir -Force
Set-Location $SigningDir
& $OpenSSL version
```

Ne jamais placer ce dossier dans `forge-desktop-app`, OneDrive public ou une archive envoyée à quelqu’un.

## Étape 3 — Créer la clé privée et la demande de certificat

Remplacer l’adresse, le nom légal et le pays dans la commande suivante :

```powershell
& $OpenSSL req -new -newkey rsa:2048 -nodes -sha256 `
  -keyout forge-developer-id-private.key `
  -out forge-developer-id.csr `
  -subj '/emailAddress=ADRESSE_APPLE/CN=NOM_LEGAL/C=FR'
```

Deux fichiers sont créés :

- `forge-developer-id-private.key` : clé privée secrète ;
- `forge-developer-id.csr` : demande publique à envoyer à Apple.

Vérifier la demande :

```powershell
& $OpenSSL req -in forge-developer-id.csr -noout -subject -verify
```

La clé `.key` ne doit jamais être envoyée à Apple, GitHub ou un utilisateur.

## Étape 4 — Obtenir le certificat Developer ID Application

1. Ouvrir <https://developer.apple.com/account/resources/certificates/list>.
2. Cliquer sur le bouton `+`.
3. Choisir **Developer ID Application** dans la section Software.
4. Envoyer `forge-developer-id.csr`.
5. Télécharger le certificat Apple `.cer`.
6. Copier le `.cer` dans `%USERPROFILE%\Forge-Apple-Signing`.

Le certificat **Developer ID Installer** n’est pas requis pour le DMG actuel. Forge a besoin de **Developer ID Application**.

## Étape 5 — Fabriquer le fichier P12 sous Windows

Dans PowerShell, depuis le dossier de signature, remplacer le nom du `.cer` si nécessaire :

```powershell
Set-Location (Join-Path $env:USERPROFILE 'Forge-Apple-Signing')

& $OpenSSL x509 -inform DER `
  -in developerID_application.cer `
  -out developerID_application.pem

& $OpenSSL pkcs12 -export `
  -inkey forge-developer-id-private.key `
  -in developerID_application.pem `
  -out Forge-Developer-ID.p12 `
  -name 'Forge Developer ID Application'
```

OpenSSL demande un mot de passe. Utiliser un mot de passe long et unique, puis le conserver dans un gestionnaire de mots de passe. Ce mot de passe deviendra `MAC_CSC_KEY_PASSWORD`.

Vérifier le P12 sans afficher son contenu :

```powershell
& $OpenSSL pkcs12 -in Forge-Developer-ID.p12 -info -noout
```

Si la conversion DER échoue parce que le certificat reçu est déjà en PEM, retirer `-inform DER` et recommencer.

## Étape 6 — Créer la clé de notarisation Apple

1. Ouvrir <https://appstoreconnect.apple.com/>.
2. Aller dans **Users and Access**.
3. Ouvrir **Integrations**.
4. Si nécessaire, demander l’accès à l’API App Store Connect avec le compte propriétaire.
5. Ouvrir **Team Keys**.
6. Créer une clé dédiée, par exemple `Forge GitHub Release`.
7. Lui donner le rôle minimal permettant la livraison, généralement **Developer**.
8. Télécharger le fichier `AuthKey_<KEY_ID>.p8`.
9. Noter le **Key ID** et l’**Issuer ID** affichés sur la page.
10. Déplacer le `.p8` dans `%USERPROFILE%\Forge-Apple-Signing`.

Apple ne permet de télécharger le fichier `.p8` qu’une seule fois. Le sauvegarder dans un emplacement chiffré. En cas de perte, révoquer la clé et en créer une nouvelle.

## Étape 7 — Ajouter les six secrets GitHub

Ouvrir le dépôt :

<https://github.com/forgestudioapp/forge-desktop-app/settings/secrets/actions>

Cliquer sur **New repository secret** pour chaque secret.

### `MAC_CSC_LINK`

Copier le P12 en Base64 dans le presse-papiers sans l’afficher :

```powershell
$P12 = Join-Path $env:USERPROFILE 'Forge-Apple-Signing\Forge-Developer-ID.p12'
[Convert]::ToBase64String([IO.File]::ReadAllBytes($P12)) | Set-Clipboard
```

Coller le résultat comme valeur de `MAC_CSC_LINK`.

### `MAC_CSC_KEY_PASSWORD`

Utiliser le mot de passe choisi lors de la création du P12.

### `APPLE_API_KEY`

Adapter le nom du fichier puis copier la clé API en Base64 :

```powershell
$P8 = Join-Path $env:USERPROFILE 'Forge-Apple-Signing\AuthKey_VOTRE_KEY_ID.p8'
[Convert]::ToBase64String([IO.File]::ReadAllBytes($P8)) | Set-Clipboard
```

Coller le résultat comme valeur de `APPLE_API_KEY`.

### Autres secrets

Créer aussi :

| Secret GitHub | Valeur |
|---|---|
| `APPLE_API_KEY_ID` | Key ID de la clé App Store Connect |
| `APPLE_API_ISSUER` | Issuer ID affiché dans App Store Connect |
| `APPLE_TEAM_ID` | Team ID de l’adhésion Apple Developer |

À la fin, GitHub doit afficher les six noms suivants, sans montrer leurs valeurs :

- `MAC_CSC_LINK`
- `MAC_CSC_KEY_PASSWORD`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `APPLE_TEAM_ID`

## Étape 8 — Conserver les secrets correctement

1. Faire une sauvegarde chiffrée de la clé `.key`, du `.p12` et du `.p8`.
2. Conserver le mot de passe du P12 dans un gestionnaire de mots de passe.
3. Ne jamais committer ces fichiers dans Git.
4. Ne jamais les envoyer par Discord, e-mail ou messagerie.
5. Révoquer immédiatement un certificat ou une clé API qui aurait été exposé.

Les secrets GitHub suffisent aux compilations. La sauvegarde privée permet de récupérer la signature si le PC tombe en panne.

## Étape 9 — Préparer la première bêta

Les changements Forge sont actuellement locaux. Avant la première livraison, il faut :

1. contrôler la liste des changements ;
2. créer un commit de version ;
3. pousser la branche sur GitHub ;
4. intégrer les changements dans la branche principale ;
5. créer un tag de bêta, par exemple `v1.6.0-beta.1` ;
6. pousser le tag.

Exemple de déclenchement une fois la branche prête :

```powershell
git tag -a v1.6.0-beta.1 -m 'Forge 1.6.0 beta 1 macOS'
git push origin v1.6.0-beta.1
```

Le tag `v*` déclenche `.github/workflows/build.yml`. GitHub utilise ses propres machines Windows et macOS : le PC local peut être éteint après l’envoi du tag.

## Étape 10 — Vérifier le résultat dans GitHub

1. Ouvrir l’onglet **Actions** du dépôt.
2. Ouvrir **Build & Release**.
3. Vérifier que `build-windows`, `build-macos` et `publish` sont verts.
4. Si `build-macos` échoue, ouvrir l’étape rouge et ne pas publier manuellement un DMG incomplet.
5. Ouvrir la page **Releases**.
6. Vérifier la présence des deux DMG Mac, des ZIP et du manifeste de sommes.

Le workflow refuse la publication si la signature, la notarisation, le ticket Apple, les tests ou les runtimes ne sont pas valides.

## Étape 11 — Choisir le bon fichier pour chaque utilisateur

Demander à l’utilisateur d’ouvrir **menu Apple → À propos de ce Mac** :

- si la ligne indique **Puce Apple M1, M2, M3, M4…**, envoyer le DMG `arm64` ;
- si elle indique **Processeur Intel**, envoyer le DMG `x64`.

Ne pas renommer les deux fichiers avec le même nom : l’architecture doit rester visible.

## Étape 12 — Instructions à envoyer au premier testeur Mac

1. Télécharger le DMG correspondant au Mac.
2. Ouvrir le DMG.
3. Glisser Forge dans **Applications**.
4. Ouvrir Forge normalement depuis Applications.
5. Vérifier qu’aucun message « développeur non identifié » n’apparaît.
6. Installer ou ouvrir Roblox Studio et publier une place de test.
7. Terminer l’accueil Forge.
8. Vérifier que le plugin Forge apparaît dans Studio ; redémarrer Studio après sa première installation si nécessaire.
9. Créer un projet Forge puis l’associer à la place ouverte.
10. Lancer un agent Codex connecté.
11. Si disponible, lancer un agent Claude Code connecté.
12. Envoyer une demande simple qui lit la scène Roblox.
13. Tester la Toolbox, changer d’onglet, fermer puis rouvrir Forge.

Le testeur doit transmettre en cas de problème :

- une capture complète ;
- le modèle du Mac et sa version de macOS ;
- le nom exact du DMG utilisé ;
- l’étape qui échoue ;
- le résultat des commandes `sw_vers` et `uname -m` dans Terminal ;
- l’heure approximative du problème.

Il ne doit transmettre aucun mot de passe, code de connexion ou jeton API.

## Étape 13 — Passer de la bêta à la version publique

La version publique peut être créée lorsque les points suivants sont validés sur au moins un Mac Apple Silicon et, si possible, un Mac Intel :

- lancement sans alerte Gatekeeper ;
- installation et réouverture de Forge ;
- plugin visible dans Roblox Studio ;
- création et réouverture d’un projet ;
- connexion Forge ↔ Studio ;
- lancement de Codex ;
- lancement de Claude Code lorsqu’un compte est disponible ;
- aucun gel lors de l’ajout d’un agent, du changement d’onglet ou de l’ouverture de la Toolbox.

Créer ensuite le tag stable :

```powershell
git tag -a v1.6.0 -m 'Forge 1.6.0'
git push origin v1.6.0
```

## Ce que le propriétaire de Forge doit réellement faire

À faire une seule fois :

- adhésion Apple Developer ;
- certificat Developer ID Application ;
- clé App Store Connect ;
- six secrets GitHub ;
- sauvegarde chiffrée des secrets.

À refaire pour chaque version :

- valider le numéro de version et les changements ;
- pousser un tag ;
- surveiller GitHub Actions ;
- faire essayer la bêta ;
- publier le lien du DMG approprié.

## Références officielles

- Certificat Developer ID : <https://developer.apple.com/help/account/certificates/create-developer-id-certificates/>
- API App Store Connect : <https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/>
- Signature macOS avec electron-builder : <https://www.electron.build/v26/docs/mac/>
- Notarisation avec electron-builder : <https://www.electron.build/v26/docs/notarization/>
- Plugins Roblox Studio : <https://create.roblox.com/docs/studio/plugins>
