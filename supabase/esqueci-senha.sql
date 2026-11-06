-- Esqueci a senha (06/11/2026): o app confere se o e-mail tem acesso antes de mandar o link.
-- Pode rodar mais de uma vez. Não mexe em nada do ranking.
create or replace function public.email_cadastrado(p_email text) returns boolean
language sql stable security definer set search_path to 'public', 'auth' as $$
  select length(trim(coalesce(p_email, ''))) between 5 and 120
     and (exists (select 1 from auth.users where lower(email) = lower(trim(p_email)))
       or exists (select 1 from public.jogadores where lower(email) = lower(trim(p_email))))
$$;
revoke all on function public.email_cadastrado(text) from public;
grant execute on function public.email_cadastrado(text) to anon, authenticated;

select 'ok: esqueci a senha pronto' as resultado;
