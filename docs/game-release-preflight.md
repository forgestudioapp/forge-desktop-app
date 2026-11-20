# Préparer la publication d'une place Roblox

Depuis **Outils du projet → Préparer la publication**, Forge affiche quatre vérifications en lecture seule : bonne place Studio, dernier code synchronisé, audit GUI sur ordinateur/tablette/mobile et playtest terminé sans erreur signalée.

Les deux derniers résultats ne comptent que s'ils ont été obtenus **dans cette session Forge** et pour le **même build synchronisé**. Après une modification du code, ils redeviennent « non vérifiés ». Une analyse GUI incomplète ou un test interrompu ne passent pas. Une compilation seule n'est pas une preuve de publication.

Le panneau guide vers les boutons existants du Lab qualité pour les contrôles manquants. Même lorsque les quatre lignes passent, Forge n'affirme ni que tout le gameplay fonctionne ni que la place est en ligne. L'utilisateur publie la place dans Roblox Studio via `File > Publish to Roblox`.

La décision est calculée par `lib/release-preflight.js` ; les cas de bonne place, ancienne version, analyse incomplète et échec sont couverts par `lib/release-preflight.test.js`.
