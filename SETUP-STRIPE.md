# Guide Setup Stripe + Forge

## 1. Créer un compte Stripe

1. Va sur https://dashboard.stripe.com/register
2. Crée ton compte (gratuit)
3. Active ton compte (documents d'identité requis)
4. Une fois approuvé, tu peux recevoir des paiements

## 2. Créer un Payment Link

1. Dans le dashboard Stripe, va sur **Products** → **Add product**
2. Crée un produit "Forge - Licence Pro"
   - Prix : 9.99€ (ou le prix que tu veux)
   - Type : One-time payment
3. Va sur **Payment Links**
4. Clique **New** → choisis ton produit
5. Active "Allow promotion codes" si tu veux
6. Copie le lien généré (ex: `https://buy.stripe.com/...`)

## 3. Configurer le Webhook Stripe

1. Va sur **Developers** → **Webhooks**
2. Clique **Add endpoint**
3. URL : `https://[ton-projet].supabase.co/functions/v1/stripe-webhook`
4. Events à écouter :
   - `checkout.session.completed`
5. Copie le **Signing secret** ( commence par `whsec_...`)

## 4. Configurer Supabase

### Variables d'environnement

Dans ton dashboard Supabase → **Settings** → **API** → **Edge Functions** :

Ajoute ces variables :
- `STRIPE_SECRET_KEY` = ta clé secrète Stripe (commence par `sk_...`)
- `STRIPE_WEBHOOK_SECRET` = le signing secret du webhook (commence par `whsec_...`)

### Installer la table des licences

1. Va dans **SQL Editor** → **New query**
2. Colle le contenu de `license-setup.sql`
3. Clique **Run**

### Déployer l'Edge Function

```bash
# Installe le CLI Supabase si tu l'as pas
npm install -g supabase

# Login
supabase login

# Link à ton projet
supabase link --project-ref [ton-project-id]

# Déploie la fonction
supabase functions deploy stripe-webhook
```

## 5. Configurer l'app Forge

Dans le fichier `.env` de ton app (ou variables d'environnement) :

```
SUPABASE_URL=https://[ton-projet].supabase.co
SUPABASE_ANON_KEY=[ta-cle-anon]
SUPABASE_SERVICE_ROLE_KEY=[ta-cle-service-role]
STRIPE_STORE_URL=https://buy.stripe.com/[ton-payment-link]
```

## 6. Page Admin (optionnel)

Ouvre `admin-licenses.html` dans ton navigateur pour gérer les clés manuellement.
Tu dois remplir `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` dans le fichier.

## 7. Tester

1. Lance l'app Forge
2. Va sur la page de login
3. Clique "Acheter une licence"
4. Utilise une carte test Stripe : `4242 4242 4242 4242`
5. Après paiement, la clé est générée automatiquement
6. Colle la clé dans l'app pour créer ton compte

## Cartes de test Stripe

| Carte | Résultat |
|-------|----------|
| `4242 4242 4242 4242` | Succès |
| `4000 0000 0000 0002` | Échec (card declined) |
| `4000 0025 0000 3155` | 3D Secure requis |

## Dépannage

- **Webhook 400** : Vérifie le signing secret
- **Clé invalide** : Vérifie que la table `license_keys` existe bien
- **Edge Function error** : Check les logs dans Supabase → Edge Functions → stripe-webhook → Logs
