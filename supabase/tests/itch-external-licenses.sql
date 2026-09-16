-- Run after the migration INSIDE a transaction which ends with ROLLBACK.
do $$
declare
  key_a text := upper(gen_random_uuid()::text);
  key_b text := upper(gen_random_uuid()::text);
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  result boolean;
begin
  insert into public.license_keys(license_key, status) values (key_a, 'active'), (key_b, 'revoked');
  if has_table_privilege('anon', 'public.license_keys', 'select') or
     has_table_privilege('authenticated', 'public.license_keys', 'truncate') then
    raise exception 'TEST FAILED: license table exposed';
  end if;
  if has_function_privilege('anon', 'public.consume_license(text,text)', 'execute') then
    raise exception 'TEST FAILED: anonymous consumption allowed';
  end if;
  begin
    insert into auth.users(id, email, raw_user_meta_data) values (user_b, user_b::text || '@example.invalid', '{}'::jsonb);
    raise exception 'TEST FAILED: signup without license succeeded';
  exception when raise_exception then
    if sqlerrm <> 'FORGE_LICENSE_REQUIRED' then raise; end if;
  end;
  begin
    insert into auth.users(id, email, raw_user_meta_data)
      values (user_b, user_b::text || '@example.invalid', jsonb_build_object('forge_license_key', key_b));
    raise exception 'TEST FAILED: revoked license succeeded';
  exception when raise_exception then
    if sqlerrm <> 'FORGE_LICENSE_UNAVAILABLE' then raise; end if;
  end;
  -- A failed signup must not spend the key (subtransaction rollback).
  begin
    insert into auth.users(id, email, raw_user_meta_data)
      values (user_a, user_a::text || '@example.invalid', jsonb_build_object('forge_license_key', key_a));
    raise exception 'SIMULATED_AUTH_FAILURE';
  exception when raise_exception then
    if sqlerrm <> 'SIMULATED_AUTH_FAILURE' then raise; end if;
  end;
  select valid into result from public.verify_license_for_signup(key_a);
  if result is distinct from true then raise exception 'TEST FAILED: failed signup spent license'; end if;
  insert into auth.users(id, email, raw_user_meta_data)
    values (user_a, user_a::text || '@example.invalid', jsonb_build_object('forge_license_key', lower(key_a), 'display_name', 'Test'));
  if exists (select 1 from auth.users where id = user_a and raw_user_meta_data ? 'forge_license_key') then
    raise exception 'TEST FAILED: key leaked into profile';
  end if;
  select valid into result from public.verify_license(key_a);
  if result is distinct from true then raise exception 'TEST FAILED: owned license invalid'; end if;
  select valid into result from public.verify_license_for_signup(key_a);
  if result is distinct from false then raise exception 'TEST FAILED: key reusable'; end if;
  begin
    insert into auth.users(id, email, raw_user_meta_data)
      values (user_b, user_b::text || '@example.invalid', jsonb_build_object('forge_license_key', key_a));
    raise exception 'TEST FAILED: second account accepted';
  exception when raise_exception then
    if sqlerrm <> 'FORGE_LICENSE_UNAVAILABLE' then raise; end if;
  end;
  update public.license_keys set status = 'revoked' where license_key = key_a;
  select valid into result from public.verify_license(key_a);
  if result is distinct from false then raise exception 'TEST FAILED: revocation ignored'; end if;
end;
$$;
set constraints all immediate;
select 'PASS: permissions, missing/revoked keys, rollback, claim, reuse, metadata, revocation, foreign keys' as license_tests;
