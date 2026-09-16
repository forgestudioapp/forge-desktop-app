# Ancienne intégration Stripe retirée

Forge vend désormais ses licences sur https://forgestudioapp.itch.io/forge.

Ne pas recréer de Payment Link ni déployer un générateur de clés Stripe. Les trois anciens endpoints `stripe-webhook`, `itch-webhook` et `send-license` répondent HTTP 410, sans création de licence ni envoi d’email. Le client ignore l’ancienne variable `STRIPE_STORE_URL`.

La configuration actuelle et le réapprovisionnement des clés sont décrits dans [ITCH-LICENSES.md](ITCH-LICENSES.md).
