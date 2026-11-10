-- Copa Davis: nível A/B de cada jogador, visível só com PIN (capitães e organizador).
-- Pode rodar mais de uma vez. Não mexe no ranking.

create table if not exists public.copa_davis_nivel (
  jog text primary key,
  nivel text not null check (nivel in ('A', 'B'))
);
alter table public.copa_davis_nivel enable row level security;
revoke all on public.copa_davis_nivel from anon, authenticated;

-- lê todos os níveis (só com PIN válido)
create or replace function public.copa_niveis(p_pin text) returns jsonb
language plpgsql security definer stable set search_path to 'public' as $$
begin
  if not exists (select 1 from copa_davis_pins where pin = p_pin and pin not like 'TROCAR%') then
    return null;
  end if;
  return coalesce((select jsonb_object_agg(jog, nivel) from copa_davis_nivel), '{}'::jsonb);
end $$;

-- marca/desmarca o nível de um jogador (só com PIN válido)
create or replace function public.copa_nivel_set(p_pin text, p_jog text, p_nivel text) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from copa_davis_pins where pin = p_pin and pin not like 'TROCAR%') then
    raise exception 'PIN inválido';
  end if;
  if p_nivel is null or p_nivel = '' then
    delete from copa_davis_nivel where jog = p_jog;
  else
    insert into copa_davis_nivel (jog, nivel) values (p_jog, p_nivel)
    on conflict (jog) do update set nivel = excluded.nivel;
  end if;
end $$;

grant execute on function public.copa_niveis(text) to anon, authenticated;
grant execute on function public.copa_nivel_set(text, text, text) to anon, authenticated;
