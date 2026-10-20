-- Les anciens points d'activation ne sont plus utilisés par Forge.
revoke all on function public.activate_license(text, text) from public, anon, authenticated;
revoke all on function public.consume_license(text, text) from public, anon, authenticated;
grant execute on function public.activate_license(text, text) to service_role;
grant execute on function public.consume_license(text, text) to service_role;

alter function public.activate_license(text, text) set search_path = '';
alter function public.consume_license(text, text) set search_path = '';
