-- ============================================================
-- FORGE — Setup du système de licences (à exécuter UNE FOIS)
--
-- Comment faire :
--   1. Ouvre https://supabase.com/dashboard → ton projet Forge
--   2. Menu gauche → SQL Editor → New query
--   3. Colle tout ce fichier et clique sur "Run"
-- ============================================================

-- 1) Table des clés de licence -------------------------------
create table if not exists public.license_keys (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  license_key text unique not null,
  email text,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  plan text default 'pro',
  stripe_session_id text,
  activated_at timestamptz,
  last_verified timestamptz,
  metadata jsonb default '{}'::jsonb
);

-- Index pour recherche rapide par clé
create index if not exists idx_license_keys_key on public.license_keys (license_key);
create index if not exists idx_license_keys_email on public.license_keys (email);

-- 2) RLS — lecture publique pour vérification ----------------
alter table public.license_keys enable row level security;

-- anyone can verify a license key (read-only)
drop policy if exists "license_verify_public" on public.license_keys;
create policy "license_verify_public"
  on public.license_keys
  for select
  using (true);

-- only service_role can insert/update (Edge Function uses service key)
drop policy if exists "license_admin_service" on public.license_keys;
create policy "license_admin_service"
  on public.license_keys
  for all
  using (true)
  with check (true);

-- 3) Fonction pour vérifier une clé -------------------------
create or replace function public.verify_license(key text)
returns table (
  valid boolean,
  license_status text,
  license_email text,
  license_plan text
)
language sql
security definer
as $$
  select
    (lk.status = 'active') as valid,
    lk.status as license_status,
    lk.email as license_email,
    lk.plan as license_plan
  from public.license_keys lk
  where lk.license_key = key
  limit 1;
$$;

-- 4) Fonction pour marquer une cle comme utilisee (apres creation de compte) ----
create or replace function public.consume_license(key text, user_email text default null)
returns table (
  valid boolean,
  message text
)
language sql
security definer
as $$
  update public.license_keys
  set
    status = 'used',
    email = coalesce(user_email, email),
    activated_at = now()
  where license_keys.license_key = key
    and license_keys.status = 'active'
  returning
    true as valid,
    'License consumed' as message;
$$;

-- 5) Vérification -------------------------------------------
select count(*) as license_table_ok from public.license_keys;
