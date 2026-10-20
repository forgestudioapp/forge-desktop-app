-- Retire la télémétrie d'installation et limite la mesure du site aux données annoncées.
-- Les anciennes lignes, collectées avant le nouveau choix explicite, sont supprimées.

truncate table public.app_installs;
truncate table public.site_visits;

drop policy if exists "anon insert app_installs" on public.app_installs;
drop policy if exists "anon update app_installs" on public.app_installs;
revoke all on table public.app_installs from anon, authenticated;

drop policy if exists "anon insert site_visits" on public.site_visits;
revoke all on table public.site_visits from anon, authenticated;
grant insert on table public.site_visits to anon;

create policy "consented session visits insert only"
  on public.site_visits
  for insert
  to anon
  with check (
    char_length(page) between 1 and 200
    and left(page, 1) = '/'
    and char_length(session_id) between 16 and 100
    and (referrer is null or char_length(referrer) <= 253)
  );

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'forge-purge-site-visits' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'forge-purge-site-visits',
  '17 3 * * *',
  $job$delete from public.site_visits where created_at < now() - interval '13 months'$job$
);
