-- ============================================================
-- FORGE — Setup de la Library communautaire (à exécuter UNE FOIS)
--
-- Comment faire :
--   1. Ouvre https://supabase.com/dashboard → ton projet Forge
--   2. Menu gauche → SQL Editor → New query
--   3. Colle tout ce fichier et clique sur "Run"
--   4. Relance l'onglet Library dans Forge
-- ============================================================

-- 1) Table des assets publiés -------------------------------
create table if not exists public.library_assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  file_name text not null,
  asset_type text not null check (asset_type in ('image','audio','model')),
  storage_path text not null,
  public_url text not null,
  size_bytes bigint,
  agent text
);

alter table public.library_assets enable row level security;

-- Tout utilisateur connecté peut lire la library
drop policy if exists "library_select_authenticated" on public.library_assets;
create policy "library_select_authenticated"
  on public.library_assets
  for select to authenticated
  using (true);

-- Un utilisateur connecté publie en son nom
drop policy if exists "library_insert_authenticated" on public.library_assets;
create policy "library_insert_authenticated"
  on public.library_assets
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Chacun peut supprimer ses propres publications
drop policy if exists "library_delete_owner" on public.library_assets;
create policy "library_delete_owner"
  on public.library_assets
  for delete to authenticated
  using (auth.uid() = user_id);

-- 2) Bucket Storage public -----------------------------------
insert into storage.buckets (id, name, public)
values ('library-assets', 'library-assets', true)
on conflict (id) do nothing;

-- 3) Policies Storage ----------------------------------------
-- Lecture publique (les miniatures <img> utilisent l'URL publique)
drop policy if exists "library_storage_read" on storage.objects;
create policy "library_storage_read"
  on storage.objects for select
  using (bucket_id = 'library-assets');

-- Upload réservé aux utilisateurs connectés
drop policy if exists "library_storage_upload" on storage.objects;
create policy "library_storage_upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'library-assets');

-- Suppression : uniquement le propriétaire (dossier = son user_id)
drop policy if exists "library_storage_delete" on storage.objects;
create policy "library_storage_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'library-assets' and (storage.foldername(name))[1] = auth.uid()::text);

-- Vérification -------------------------------------------------
select count(*) as library_ok from public.library_assets;