-- Copa Davis: organizador vê e troca os PINs pelo app. Pode rodar mais de uma vez.

-- lista os PINs (só com o PIN do organizador)
create or replace function public.copa_ver_pins(p_admin text) returns jsonb
language plpgsql security definer stable set search_path to 'public' as $$
begin
  if not exists (select 1 from copa_davis_pins where pin = p_admin and papel = 'admin' and pin not like 'TROCAR%') then
    return null;
  end if;
  return (select jsonb_object_agg(papel, pin) from copa_davis_pins);
end $$;

-- troca o PIN de um papel ('admin', 'A' ou 'B'); só o organizador pode
create or replace function public.copa_trocar_pin(p_admin text, p_papel text, p_novo text) returns text
language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from copa_davis_pins where pin = p_admin and papel = 'admin' and pin not like 'TROCAR%') then
    raise exception 'Só o organizador troca PIN';
  end if;
  if p_papel not in ('admin', 'A', 'B') then raise exception 'Papel inválido'; end if;
  if p_novo !~ '^[0-9]{4,8}$' then raise exception 'O PIN precisa ter de 4 a 8 números'; end if;
  if exists (select 1 from copa_davis_pins where pin = p_novo and papel <> p_papel) then
    raise exception 'Esse PIN já é de outra pessoa';
  end if;
  delete from copa_davis_pins where papel = p_papel;
  insert into copa_davis_pins (pin, papel) values (p_novo, p_papel);
  return p_novo;
end $$;

grant execute on function public.copa_ver_pins(text) to anon, authenticated;
grant execute on function public.copa_trocar_pin(text, text, text) to anon, authenticated;
