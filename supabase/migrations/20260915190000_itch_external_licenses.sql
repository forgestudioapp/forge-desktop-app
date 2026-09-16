-- Direct itch.io keys: claim the license in the same transaction as signup.
-- Deploy with the desktop client sending data.forge_license_key at signup.
begin;

alter table public.license_keys add column if not exists user_id uuid
  references auth.users(id) on delete set null deferrable initially deferred;
alter table public.license_keys add column if not exists claimed_at timestamptz;
alter table public.license_keys enable row level security;
drop policy if exists license_verify_public on public.license_keys;
revoke all on public.license_keys from public, anon, authenticated;
grant all on public.license_keys to service_role;

-- Preserve existing accounts and revocations. Never make a claimed key reusable.
update public.license_keys lk
set user_id = u.id, claimed_at = coalesce(lk.claimed_at, lk.activated_at, u.created_at, now())
from auth.users u
where lk.user_id is null and lower(lk.email) = lower(u.email);

create or replace function public.verify_license(key text)
returns table(valid boolean, license_status text, license_email text, license_plan text)
language sql security definer set search_path = ''
as $$
  select (lk.status = 'active' or (lk.status = 'used' and lk.claimed_at is not null)),
    lk.status, null::text, lk.plan
  from public.license_keys lk where lk.license_key = upper(btrim(key)) limit 1;
$$;

create or replace function public.verify_license_for_signup(key text)
returns table(valid boolean, license_status text, license_email text, license_plan text)
language sql security definer set search_path = ''
as $$
  select (lk.status = 'active' and lk.claimed_at is null and lk.user_id is null),
    case when lk.status = 'active' and (lk.claimed_at is not null or lk.user_id is not null)
      then 'claimed' else lk.status end,
    null::text, lk.plan
  from public.license_keys lk where lk.license_key = upper(btrim(key)) limit 1;
$$;

create or replace function public.claim_forge_license_on_signup()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  supplied_key text := upper(btrim(coalesce(new.raw_user_meta_data->>'forge_license_key', '')));
  claimed_id uuid;
begin
  if supplied_key = '' then
    raise exception 'FORGE_LICENSE_REQUIRED' using errcode = 'P0001';
  end if;
  -- The conditional UPDATE serializes competing signups on the same key.
  update public.license_keys
    set user_id = new.id, email = new.email, claimed_at = now(), activated_at = now()
    where license_key = supplied_key and status = 'active'
      and user_id is null and claimed_at is null
    returning id into claimed_id;
  if claimed_id is null then
    raise exception 'FORGE_LICENSE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  -- A license must not appear in auth responses or user-editable profile metadata.
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'forge_license_key';
  return new;
end;
$$;
revoke all on function public.claim_forge_license_on_signup() from public, anon, authenticated;
drop trigger if exists forge_claim_license on auth.users;
create trigger forge_claim_license before insert on auth.users
  for each row execute function public.claim_forge_license_on_signup();

-- Old clients must no longer consume arbitrary licenses via an anonymous call.
revoke all on function public.consume_license(text, text) from public, anon, authenticated;
grant execute on function public.consume_license(text, text) to service_role;
revoke all on function public.verify_license(text) from public;
grant execute on function public.verify_license(text) to anon, authenticated, service_role;
revoke all on function public.verify_license_for_signup(text) from public;
grant execute on function public.verify_license_for_signup(text) to anon, authenticated, service_role;
commit;
