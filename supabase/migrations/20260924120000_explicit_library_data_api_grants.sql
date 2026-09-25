-- Keep Forge compatible with Supabase's 2026 Data API grant change.
-- RLS remains enabled and is still the final authorization layer.
begin;

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
revoke all on public.library_assets from public, anon, authenticated;
grant select, insert, delete on public.library_assets to authenticated;
grant all on public.library_assets to service_role;

drop policy if exists "library_select_authenticated" on public.library_assets;
create policy "library_select_authenticated"
  on public.library_assets for select to authenticated using (true);

drop policy if exists "library_insert_authenticated" on public.library_assets;
create policy "library_insert_authenticated"
  on public.library_assets for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "library_delete_owner" on public.library_assets;
create policy "library_delete_owner"
  on public.library_assets for delete to authenticated
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('library-assets', 'library-assets', true)
on conflict (id) do nothing;

drop policy if exists "library_storage_read" on storage.objects;
create policy "library_storage_read"
  on storage.objects for select
  using (bucket_id = 'library-assets');

drop policy if exists "library_storage_upload" on storage.objects;
create policy "library_storage_upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'library-assets');

drop policy if exists "library_storage_delete" on storage.objects;
create policy "library_storage_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'library-assets' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
