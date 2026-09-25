-- Analytics Forge : visites du site + installations app (anonyme, sans IP stockée).
-- L'opt-out perso se fait côté client (localStorage forge_no_track=1), jamais compté ici.

create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  page text not null,
  referrer text,
  session_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_installs (
  install_id uuid primary key,
  app_version text not null,
  platform text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

alter table public.site_visits enable row level security;
alter table public.app_installs enable row level security;

-- Insert seul pour anon : personne ne peut lire les données via la clé publique.
drop policy if exists "anon insert site_visits" on public.site_visits;
create policy "anon insert site_visits"
  on public.site_visits for insert to anon with check (true);

drop policy if exists "anon insert app_installs" on public.app_installs;
create policy "anon insert app_installs"
  on public.app_installs for insert to anon with check (true);

drop policy if exists "anon update app_installs" on public.app_installs;
create policy "anon update app_installs"
  on public.app_installs for update to anon using (true) with check (true);

create index if not exists site_visits_created_at_idx on public.site_visits (created_at desc);
create index if not exists site_visits_page_idx on public.site_visits (page);
create index if not exists app_installs_last_seen_idx on public.app_installs (last_seen desc);
