# Achat et activation Forge

Parcours : site officiel → téléchargement Windows → dans Forge, « Acheter une licence » → paiement itch.io → récupération de la clé sur la page d'achat → dans Forge, clé + email + mot de passe → confirmation de l'email → connexion.

La page itch.io fournit également l'installateur, comme téléchargement de secours. Le bouton de remise de clé appartient à itch.io, dans la section des clés externes « Other ». Le vendeur utilise Distribute → External keys. La remise de clés avec les nouveaux achats doit rester activée.

## Serveur et client

- Forge 1.5.5+ transmet `data.forge_license_key` à Supabase pendant l'inscription.
- La migration `supabase/migrations/20260915190000_itch_external_licenses.sql` associe la clé et le compte dans une seule transaction. Une inscription annulée ne consomme pas la clé. Deux inscriptions ne peuvent pas réclamer la même clé.
- La table n'est pas lisible par les clients. Les deux fonctions de vérification acceptent une clé précise et ne retournent aucun email.
- Les comptes existants restent utilisables. Les anciennes versions doivent être mises à jour pour une nouvelle inscription.
- `send-license`, `itch-webhook` et `stripe-webhook` sont retirés : réponse HTTP 410 avec explication du nouveau parcours, sans génération ni divulgation de clé. Aucun webhook itch.io n'est nécessaire.
- Le bouton d'achat ouvre directement la page Forge sur itch.io. L'ancienne variable `STRIPE_STORE_URL` est ignorée par le code actuel (à partir du prochain build après 1.5.5).
- La confirmation d'email Supabase reste activée. Une réponse sans session ne connecte pas prématurément le client.

## Réapprovisionner le stock

1. Exécuter `node scripts/generate-itch-license-stock.cjs 100`.
2. Le script affiche un dossier sous `.private-licenses/`. Ne jamais publier ce dossier, son fichier SQL ou ses clés.
3. Importer son `import.sql` avec `supabase db query --linked --file CHEMIN/import.sql`. Vérifier le nombre importé.
4. Sur itch.io, Distribute → External keys → Other, coller le contenu de `itch-keys.txt` et ajouter les clés.
5. Vérifier le nombre disponible et l'option « Give key with new purchases ».

Le stock initial est de 100 clés. Itch.io distribue les clés depuis ce stock ; son renouvellement n'est pas automatique. Le compteur itch.io indique les clés non récupérées par les acheteurs. Le compteur Supabase indique les clés non activées dans Forge : ces compteurs ont des sens différents.

## Ce que reçoit l'acheteur

Après paiement, itch.io affiche la page personnelle de l'achat et envoie un reçu contenant le lien vers cette page. La clé Forge ne doit pas être annoncée comme envoyée directement dans le mail : l'acheteur la réclame avec « Request key » sur sa page d'achat, puis la copie dans Forge. Il n'a pas besoin de réinstaller l'application. Le mail de confirmation du compte Forge arrive ensuite, après son inscription.

## Vérifications

- Tests client : `node --test lib/license-client.test.js`.
- Tests SQL : migration puis `supabase/tests/itch-external-licenses.sql` dans une transaction terminée par `ROLLBACK` ; aucun compte test ne doit être conservé.
- Test manuel final : installer depuis le site, ouvrir l'achat depuis Forge, récupérer la clé après un achat réel, créer le compte, confirmer l'email, puis se reconnecter. Ce test de paiement réel ne fait pas partie des vérifications automatisées.
